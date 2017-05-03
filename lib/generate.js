'use strict';
const debug = require('debug')('brunch:generate');
const sysPath = require('universal-path');
const anysort = require('anysort');
const deppack = require('deppack');
const BrunchError = require('./error');
const {respondTo} = require('./plugins');

const {
  flatten,
  promiseReduce,
  formatOptimizerError,
  writeFile,
  jsonToData,
} = require('./helpers');

const {
  SourceMapConsumer,
  SourceMapGenerator,
  SourceNode,
} = require('source-map');

// Generate: [File] -> File.
// Takes a list of files (FileList) and makes one output from it.

// Sorts by pattern.
// sort(['b.coffee', 'c.coffee', 'a.coffee'], {before: ['a.coffee'], after: ['b.coffee']})
// => ['a.coffee', 'c.coffee', 'b.coffee']
// Returns new sorted array.
const sortByConfig = (files, config) => {
  if (config !== Object(config)) return files;
  const criteria = [
    config.before || [],
    config.after || [],
    config.joinToValue || [],
    config.bower || [],
    config.vendorConvention || (() => false),
  ];
  return anysort.grouped(files, criteria, [0, 2, 3, 4, 5, 1]);
};

const extractOrder = (files, config) => {
  const types = files.map(file => `${file.type}s`);
  const orders = Object.keys(config.files)
    .filter(key => types.includes(key))
    .map(key => config.files[key].order || {});

  const before = flatten(orders.map(type => type.before || []));
  const after = flatten(orders.map(type => type.after || []));
  const norm = config._normalized;
  const vendorConvention = norm.conventions.vendor;
  const bower = norm.packageInfo.bower.order;
  return {before, after, vendorConvention, bower};
};

const sort = (files, config, joinToValue) => {
  const paths = files.map(file => file.path);
  const indexes = Object.create(null);
  files.forEach(file => {
    indexes[file.path] = file;
  });
  const order = extractOrder(files, config);
  if (Array.isArray(joinToValue)) order.joinToValue = joinToValue;
  return sortByConfig(paths, order).map(path => indexes[path]);
};

const concat = (files, path, definitionFn, autoRequire, config) => {
  if (autoRequire == null) autoRequire = [];
  const isJs = !!definitionFn;

  const root = new SourceNode();
  const srcPaths = files.map(f => f.path).join(', ');
  debug(`Concatenating [${srcPaths}] => ${path}`);

  const processor = file => {
    root.add(file.node);
    const data = file.node.isIdentity ? file.data : file.source;
    if (isJs && !/;\s*$/.test(data)) root.add(';');
    return root.setSourceContent(file.node.source, data);
  };

  if (isJs) {
    const addRequire = req => root.add(`require('${req}');`);

    const isNpm = config.npm.enabled ? deppack.needsProcessing : () => false;

    const moduleFiles = files.filter(f => isNpm(f) || f.file.isModule);
    const nonModuleFiles = files.filter(f => !moduleFiles.includes(f));

    const definition = definitionFn(path, root.sourceContents);
    const generateModuleFiles = () => {
      if (config.npm.enabled && moduleFiles.length) {
        deppack.processFiles(root, moduleFiles, processor);
      } else {
        moduleFiles.forEach(processor);
      }
    };

    const basicGenerate = (generateModuleFiles, nonModuleFiles, processor, deppack, definition, path, root) => {
      root.add(definition);
      generateModuleFiles();
      nonModuleFiles.forEach(processor);
    };

    const generator = basicGenerate;
    generator(generateModuleFiles, nonModuleFiles, processor, deppack, definition, path, root);

    autoRequire.forEach(addRequire);
  } else {
    files.forEach(processor);
  }
  return root.toStringWithSourceMap({file: path});
};

const prepareSourceMap = (optimizedMap, sourceFiles) => {
  if (optimizedMap == null) return;
  const map = SourceMapGenerator.fromSourceMap(new SourceMapConsumer(optimizedMap));
  if (map._sourcesContents == null) map._sourcesContents = {};
  sourceFiles.forEach(({path, source}) => {
    map._sourcesContents[path] = source;
  });
  return map;
};

const runOptimizer = optimizer => genFile => {
  if (!genFile) {
    throw new BrunchError('OPTIMIZER_INVALID', {optimizer});
  }
  const {path, sourceFiles, map: unoptMap} = genFile;
  debug(`Optimizing ${path} @ ${optimizer.brunchPluginName}`);

  return optimizer.optimize(genFile).then(optimized => {
    const {data} = optimized;
    const map = prepareSourceMap(optimized.map, sourceFiles) || unoptMap;
    return {data, path, map, sourceFiles, code: data};
  }, error => {
    throw formatOptimizerError(error, path);
  });
};

const optimize = (data, map, path, optimizers, sourceFiles) => {
  const initial = {data, path, map, sourceFiles, code: data};
  return promiseReduce(optimizers, runOptimizer, initial);
};

const generate = (path, targets, config) => {
  const type = targets.some(file => file.isJS) ? 'javascript' : 'stylesheet';
  const optimizers = respondTo('optimize').filter(optimizer => optimizer.type === type);

  const joinKey = path.slice(config.paths.public.length + 1);
  const typeConfig = config.files[`${type}s`] || {};
  const joinToValue = typeConfig.joinTo && typeConfig.joinTo[joinKey] || {};
  const sorted = sort(targets, config, joinToValue);
  const norm = config._normalized;
  const definition = type === 'javascript' ? norm.modules.definition : null;
  const {code, map} = concat(
    sorted, path, definition,
    norm.modules.autoRequire[joinKey],
    config
  );

  const withMaps = map && config.sourceMaps;
  const mapPath = `${path}.map`;
  return optimize(code, map, path, optimizers, targets)
    .then(data => {
      if (withMaps) {
        const mapRoute = config.sourceMaps === 'inline' ?
          jsonToData(data.map) :
          config.sourceMaps === 'absoluteUrl' ?
          mapPath.replace(config.paths.public, '') :
          sysPath.basename(mapPath);
        const end = `# sourceMappingURL=${mapRoute}`;
        data.code += type === 'javascript' ? `\n//${end}` : `\n/*${end}*/`;
      }
      return data;
    })
    .then(data => {
      return Promise.all([
        writeFile(path, data.code),
        withMaps && config.sourceMaps !== 'inline' && writeFile(mapPath, data.map.toString()),
      ]).then(() => data);
    });
};

module.exports = generate;