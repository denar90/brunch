'use strict';
const application = require('../application');
const plugins = require('../plugins');

let cfg, plugs; // eslint-disable-line prefer-const

const options = JSON.parse(process.env.BRUNCH_OPTIONS);
application.loadConfigWorker(false, options).then(_cfg => {
  cfg = _cfg;
  return plugins.init(cfg, () => {}).then(_plugins => {
    plugs = _plugins;
    process.send('ready');
  });
});

const OptimizeJob = require('../fs_utils/generate').OptimizeJob;
const CompileJob = require('../fs_utils/pipeline').CompileJob;

const jobs = {OptimizeJob, CompileJob};

const processMsg = (msg) => {
  const type = msg.type;
  const data = msg.data;

  const job = jobs[type];
  const hash = job.deserialize({ plugins: plugs }, data.hash);
  return job.work(hash);
};

process.on('message', msg => {
  processMsg(msg).then(result => process.send({result}), error => process.send({error: error.message}));
});