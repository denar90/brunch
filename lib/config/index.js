'use strict';
require('micro-es7-shim');

const checkDeps = require('check-dependencies');
const sysPath = require('universal-path');
const logger = require('loggy');
const pify = require('pify');
const validate = require('./validate');
const BrunchError = require('./error');
const install = require('deps-install');
const {isWorker} = require('cluster');

const {
  deepFreeze,
  fileExists,
  isSymlink,
  flat,
  asyncFilter,
} = require('../helpers');

const dontMerge = files => {
  const values = Object.values(files);

  // this fn will be called on every nested object that will be merged
  return (target, source) => {
    if (!values.includes(target)) return () => true;

    // this fn will be called on every enumerable entry in source
    return key => {
      // if either joinTo or entryPoints is overriden but not both, reset the other, as they are supposed to go hand-in-hand
      const otherKey = key === 'joinTo' ? 'entryPoints' : key === 'entryPoints' ? 'joinTo' : null;
      if (otherKey && otherKey in target && !(otherKey in source)) {
        delete target[otherKey];
      }

      return false;
    };
  };
};

const applyOverrides = envs => config => {
  if (envs.length) {
    // Preserve default config before overriding.
    const defaults = config.overrides._default = {};

    Object.keys(config).forEach(key => {
      if (key === 'overrides') return;
      const value = config[key];
      if (value !== Object(value)) return;

      const override = defaults[key] = {};
      deepAssign(override, value);
    });
  }

  envs.forEach(env => {
    const {plugins} = config;
    const overrideProps = config.overrides[env] || {};
    const specials = {on: 'off', off: 'on'};

    // Special override handling for plugins.on|off arrays (gh-826).
    Object.keys(specials).forEach(k => {
      const v = specials[k];
      if (plugins[v]) {
        if (overrideProps.plugins == null) overrideProps.plugins = {};
        const item = overrideProps.plugins[v] || [];
        const cItem = plugins[v] || [];
        overrideProps.plugins[v] = item.concat(cItem.filter(plugin => {
          const list = overrideProps.plugins[k];
          return list && !list.includes(plugin);
        }));
      }
    });
    deepAssign(config, overrideProps, dontMerge(config.files));
  });
  // ensure server's public path takes overrides into account
  config.server.publicPath = config.paths.public;
  return config;
};

const normalizeJoinConfig = joinTo => {
  const object = typeof joinTo === 'string' ?
    {[joinTo]: () => true} :
    joinTo || {};

  return Object.keys(object).reduce((subCfg, path) => {
    const checker = object[path];
    subCfg[path] = anymatch(checker);
    return subCfg;
  }, {});
};

/* Converts `config.files[...].joinTo` to one format.
 * config.files[type].joinTo can be a string, a map of {str: regexp} or a map
 * of {str: function}.
 * Also includes `config.files.javascripts.entryPoints`.
 *
 * Example output:
 *
 * {
 *   javascripts: {'*': {'javascripts/app.js': checker}, 'app/init.js': {'javascripts/bundle.js': 'app/init.js'}},
 *   templates: {'*': {'javascripts/app.js': checker2}}
 * }
 */
const createJoinConfig = (cfgFiles, paths) => {
  if (cfgFiles.javascripts && 'joinTo' in cfgFiles.javascripts) {
    if (!cfgFiles.templates) cfgFiles.templates = {};
    if (!('joinTo' in cfgFiles.templates)) {
      cfgFiles.templates.joinTo = cfgFiles.javascripts.joinTo;
    }
  }

  const types = Object.keys(cfgFiles);
  const joinConfig = types.reduce((joinConfig, type) => {
    const fileCfg = cfgFiles[type];
    const subCfg = normalizeJoinConfig(fileCfg.joinTo);
    joinConfig[type] = subCfg;

    // special matching for plugin helpers
    return joinConfig;
  }, {});

  // the joinTo is just a special case of entryPoints
  const entryPoints = types.reduce((entryPoints, type) => {
    const point = entryPoints[type] = {};
    if (type in joinConfig) point['*'] = joinConfig[type];
    return entryPoints;
  }, {});

  const outPaths = [];
  types.forEach(type => {
    const fileCfg = cfgFiles[type];
    if (!fileCfg.entryPoints) return;
    if (type !== 'javascripts') {
      logger.warn(`entryPoints can only be used with 'javascripts', not '${type}'`);
      return;
    }

    Object.keys(fileCfg.entryPoints).forEach(target => {
      const isTargetWatched = paths.watched.some(path => target.startsWith(`${path}/`));
      if (!isTargetWatched) {
        logger.warn(`The correct use of entry points is: \`'entryFile.js': 'outputFile.js'\`. You are trying to use '${target}' as an entry point, but it is probably an output file.`);
      }
      const entryCfg = fileCfg.entryPoints[target];
      const alreadyDefined = Object.keys(entryCfg).some(out => out in joinConfig[type]);
      if (alreadyDefined) {
        logger.warn(`config.files.${type}.joinTo is already defined for '${target}', can't add an entry point`);
        return;
      }

      const normalizedEntryCfg = normalizeJoinConfig(entryCfg);
      Object.keys(normalizedEntryCfg).forEach(path => {
        if (outPaths.includes(path)) {
          logger.warn(`'${path}' is already used by another entry point, can't add it to config.files.${type}.entryPoints for '${target}'`);
          delete normalizedEntryCfg[path];
          return;
        }

        outPaths.push(path);
      });
      entryPoints[type][target] = normalizedEntryCfg;
    });
  });

  return Object.freeze(entryPoints);
};

const setLoggyOptions = config => {
  if (config === false) {
    logger.notifications = false;
    return;
  }

  if (config === true) {
    logger.warn('`config.notifications: true` is deprecated. Notifications are on by default. Remove the option.');
    config = {};
  } else if (Array.isArray(config)) {
    logger.warn('`config.notifications` array is deprecated. Use `config.notifications.levels` instead.');
    config = {levels: config};
  }

  Object.assign(logger.notifications, config);
};

const setConfigDefaults = configPath => config => {
  setLoggyOptions(config.notifications);

  const {paths, server} = config;
  const join = path => {
    const absPath = sysPath.isAbsolute(path) ? path : sysPath.join(paths.root, path);
    return absPath.replace(/\/$/, '');
  };

  paths.config = configPath;

  for (const [key, path] of Object.entries(paths)) {
    if (key === 'root') continue;
    paths[key] = Array.isArray(path) ? path.map(join) : join(path);
  }

  server.publicPath = paths.public;

  return config;
};

// remove
const normalizeConfig = config => {
  const {paths, watcher} = config;
  const {ignored, assets, vendor} = conventions;

  const checker = include.concat(config.conventions[key]);
  conventions.ignored = p => !vendor(p) && ignored(p)
  conventions.assets = p => !vendor(p) && assets(p)

  // Object.keys(config.conventions).forEach(key => {
  //   const include = key === 'ignored' ? allConfigFiles : []; // will be a function now

  //   const fn = anymatch(checker);

  //   conventions[key] = key === 'vendor' ? fn :
  //     path => !isNpm(path) && fn(path);
  // });

  Object.assign(norm, {
    join: createJoinConfig(config.files, paths),
    watcher: {
      usePolling: watcher.usePolling,
      awaitWriteFinish: watcher.awaitWriteFinish === true ?
        {stabilityThreshold: 50, pollInterval: 10} :
        watcher.awaitWriteFinish,
    },
  });

  return config;
};

const addDefaultServer = config => {
  if (isWorker) return config;
  if (config.server.path) return config;
  // stinks
  try {
    const defaultServerFilename = 'brunch-server';
    const resolved = require.resolve(sysPath.resolve(defaultServerFilename));
    try {
      require(resolved);
    } catch (error) {
      // Do nothing.
    }
    if (config.server.path == null) {
      config.server.path = resolved;
    }
  } catch (error) {
    // Do nothing.
  }
  return config;
};

const minimalConfig = `Here's a minimal config to get you started:

module.exports = {
  files: {
    javascripts: {
      entryPoints: {
        'init.js': 'app.js'
      }
    }
  }
}`;

const tryToLoad = configPath => {
    // Assign fullPath in two steps in case require.resolve throws.
    try {
      require('coffee-script/register');
    } catch (err) {
      // coffee is optional since 3.0
    }
    fullPath = sysPath.resolve(configPath);
    fullPath = require.resolve(fullPath);
    delete require.cache[fullPath];
    const resolved = require(fullPath);
    basename = sysPath.basename(fullPath);
    resolve(resolved);
  }).then(obj => {
    const config = obj && obj.config || obj;
    if (config !== Object(config)) {
      throw new BrunchError('CFG_NOT_OBJECT', {basename});
    }
    if (!config.files) {
      throw new BrunchError('CFG_NO_FILES', {basename, minimalConfig});
    }
    return config;
  }).catch(error => {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw new BrunchError('CFG_LOAD_FAILED', {error});
    }

    const path = /^Cannot find module '(.+)'/.exec(error.message)[1];
    if (path.includes(fullPath)) {
      logger.error(`The directory doesn't seem to be a Brunch project. Create brunch-config.js or run Brunch from the correct directory.`);
      logger.error(minimalConfig);
      process.exit(1);
    } else if (!path.startsWith('.')) {
      try {
        const pkg = require(sysPath.resolve('.', 'package.json'));
        if (pkg) {
          const [topLevelMod] = path.split('/');
          const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
          if (topLevelMod in deps) {
            logger.warn(`Config requires '${topLevelMod}' which is in package.json but wasn't yet installed. Trying to install...`);
            return install({pkgType: 'package'}).then(() => tryToLoad(configPath));
          }
        }
      } catch (e) {
        // error
      }
    }

    throw error;
};

const checkProjectDependencies = config => {
  const packageDir = config.paths.root;
  const scopeList = config.envs.includes('production') ?
    ['dependencies'] :
    ['dependencies', 'devDependencies'];

  return checkDeps({packageDir, scopeList}).then(out => {
    if (out.depsWereOk) return;
    const pkgs = out.error.filter(msg => msg.includes(':')).map(msg => msg.split(':', 1)[0]);
    const pkgPath = pkg => sysPath.join(packageDir, 'node_modules', pkg);
    const isNotSymlink = pkg => isSymlink(pkgPath(pkg)).then(x => !x);
    return asyncFilter(pkgs, isNotSymlink).then(unmetPkgs => {
      if (!unmetPkgs.length) return;
      logger.info(`Using outdated versions of ${unmetPkgs.join(', ')}, trying to update to match package.json versions`);
      return install({rootPath: packageDir, pkgType: 'package'});
    });
  }).then(() => config);
};

const init = (configPath, partConfig) => {
  const config = loadConfig(configPath)
  Hoek.deepAssign()

  return tryToLoad(partConfig.paths.config)
    .then(validateConfig)
    .then(setConfigDefaults(paths.config))
    .then(addDefaultServer)
    .then(applyOverrides(env)) // order
    .then(config => deepAssign(config, partConfig)) // of these two sucks???
    .then(normalizeConfig)
    .then(checkProjectDependencies)
    .then(deepFreeze);
};

module.exports = {
  raw,
  norm,
  init,
};