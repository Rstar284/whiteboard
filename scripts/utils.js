const path = require("path");

const getArgs = function () {
    const args = {};
    process.argv.slice(2, process.argv.length).forEach((arg) => {
        if (arg.slice(0, 2) === "--") {
            const longArg = arg.split("=");
            args[longArg[0].slice(2, longArg[0].length)] = longArg[1];
        }
        else if (arg[0] === "-") {
            const flags = arg.slice(1, arg.length).split("");
            flags.forEach((flag) => {
                args[flag] = true;
            });
        }
    });
    return args;
};

const getSafeFilePath = function (rootPath, singleFileSegment) {
    var filePath = path.join(rootPath, singleFileSegment);
    if (
        path.dirname(filePath) !== rootPath ||
        path.basename(filePath) !== singleFileSegment ||
        path.normalize(singleFileSegment) !== singleFileSegment
    ) {
        var errorMessage = "Attempted path traversal attack: ";
        console.log(errorMessage, {
            rootPath: rootPath,
            singleFileSegment: singleFileSegment,
        });
        throw new Error(errorMessage + singleFileSegment);
    }
    return filePath;
};

module.exports = {
    getArgs,
    getSafeFilePath,
};
