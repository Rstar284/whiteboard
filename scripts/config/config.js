const util = require("util");

const { getDefaultConfig, getConfig, deepMergeConfigs, isConfigValid } = require("./utils");

const { getArgs } = require("./../utils");

const defaultConfig = getDefaultConfig();

const cliArgs = getArgs();
let userConfig = {};

if (cliArgs["config"]) {
    userConfig = getConfig(cliArgs["config"]);
}

const config = deepMergeConfigs(defaultConfig, userConfig);

if (!isConfigValid(config, true)) throw new Error("Config is not valid. Check logs for details");

if (!process.env.JEST_WORKER_ID) {
    console.info(util.inspect(config, { showHidden: false, depth: null, colors: true }));
}

module.exports = config;
