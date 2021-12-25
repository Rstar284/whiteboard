const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true });

const configSchema = require("./config-schema.json");

function getConfig(path) {
    return yaml.load(fs.readFileSync(path, "utf8"));
}

function isConfigValid(config, warn = true) {
    const validate = ajv.compile(configSchema);
    const isValidAgainstSchema = validate(config);
    if (!isValidAgainstSchema && warn) console.warn(validate.errors);
    let structureIsValid = false;
    try {
        structureIsValid = config.frontend.performance.pointerEventsThrottling.some(
            (item) => item.fromUserCount === 0
        );
    } catch (e) {
        if (!e instanceof TypeError) {
            throw e;
        }
    }
    if (!structureIsValid && warn)
        console.warn(
            "At least one item under frontend.performance.pointerEventsThrottling" +
                "must have fromUserCount set to 0"
        );
    return isValidAgainstSchema && structureIsValid;
}

function getDefaultConfig() {
    const defaultConfigPath = path.join(__dirname, "..", "..", "config.yml");
    return getConfig(defaultConfigPath);
}

function deepMergeConfigs(baseConfig, overrideConfig) {
    const out = {};

    Object.entries(baseConfig).forEach(([key, val]) => {
        out[key] = val;
        if (overrideConfig.hasOwnProperty(key)) {
            const overrideVal = overrideConfig[key];
            if (typeof val === "object" && !Array.isArray(val) && val !== null) {
                out[key] = deepMergeConfigs(val, overrideVal);
            } else {
                out[key] = overrideVal;
            }
        }
    });

    return out;
}

module.exports.getConfig = getConfig;
module.exports.getDefaultConfig = getDefaultConfig;
module.exports.deepMergeConfigs = deepMergeConfigs;
module.exports.isConfigValid = isConfigValid;
