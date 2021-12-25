const path = require("path");

const config = require("./config/config");
const ReadOnlyBackendService = require("./services/ReadOnlyBackendService");
const WhiteboardInfoBackendService = require("./services/WhiteboardInfoBackendService");
const { getSafeFilePath } = require("./utils");
const fs = require("fs-extra");
const express = require("express");
const formidable = require("formidable");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

function startBackendServer(port) {
    const window = new JSDOM("").window;
    const DOMPurify = createDOMPurify(window);
    let s_whiteboard = require("./s_whiteboard.js");
    let app = express();
    let server = require("http").Server(app);
    server.listen(port);
    let io = require("socket.io")(server, { path: "/ws-api" });
    WhiteboardInfoBackendService.start(io);
    console.log("Server running on port:" + port);
    const {accessToken} = config.backend;

    //Expose static folders
    app.use(express.static(path.join(__dirname, "..", "dist")));
    app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));
    app.get("/api/loadwhiteboard", function (req, res) {
        let query = escapeAllContentStrings(req["query"]);
        const wid = query["wid"];
        const at = query["at"];
        if (accessToken === "" || accessToken == at) {
            const widForData = ReadOnlyBackendService.isReadOnly(wid)
                ? ReadOnlyBackendService.getIdFromReadOnlyId(wid)
                : wid;
            const ret = s_whiteboard.loadStoredData(widForData);
            res.send(ret);
            res.end();
        } else {
            res.status(401);
            res.end();
        }
    });

    app.get("/api/getReadOnlyWid", function (req, res) {
        let query = escapeAllContentStrings(req["query"]);
        const wid = query["wid"];
        const at = query["at"];
        if (accessToken === "" || accessToken == at) {
            res.send(ReadOnlyBackendService.getReadOnlyId(wid));
            res.end();
        } else {
            res.status(401);
            res.end();
        }
    });
    app.post("/api/upload", function (req, res) {
        //File upload
        let form = new formidable.IncomingForm();
        let formData = {
            files: {},
            fields: {},
        };

        form.on("file", function (name, file) {
            formData["files"][file.name] = file;
        });

        form.on("field", function (name, value) {
            formData["fields"][name] = value;
        });

        form.on("error", function (err) {
            console.log("File uplaod Error!");
        });

        form.on("end", function () {
            if (accessToken === "" || accessToken == formData["fields"]["at"]) {
                progressUploadFormData(formData, function (err) {
                    if (err) {
                        if (err == "403") {
                            res.status(403);
                        } else {
                            res.status(500);
                        }
                        res.end();
                    } else {
                        res.send("done");
                    }
                });
            } else {
                res.status(401);
                res.end();
            }
        });
        form.parse(req);
    });
    app.get("/api/drawToWhiteboard", function (req, res) {
        let query = escapeAllContentStrings(req["query"]);
        const wid = query["wid"];
        const at = query["at"];
        if (!wid || ReadOnlyBackendService.isReadOnly(wid)) {
            res.status(401);
            res.end();
        }

        if (accessToken === "" || accessToken == at) {
            const broadcastTo = (wid) => io.compress(false).to(wid).emit("drawToWhiteboard", query);
            broadcastTo(wid);
            const readOnlyId = ReadOnlyBackendService.getReadOnlyId(wid);
            broadcastTo(readOnlyId);
            s_whiteboard.handleEventsAndData(query);
            res.send("done");
        } else {
            res.status(401);
            res.end();
        }
    });

    function progressUploadFormData(formData, callback) {
        console.log("Progress new Form Data");
        const fields = escapeAllContentStrings(formData.fields);
        const wid = fields["whiteboardId"];
        if (ReadOnlyBackendService.isReadOnly(wid)) return;
        const readOnlyWid = ReadOnlyBackendService.getReadOnlyId(wid);
        const date = fields["date"] || +new Date();
        const filename = `${readOnlyWid}_${date}.png`;
        const savingDir = getSafeFilePath("public/uploads", readOnlyWid);
        fs.ensureDir(savingDir, function (err) {
            if (err) {
                console.log("Could not create upload folder!", err);
                return;
            }
            let imagedata = fields["imagedata"];
            if (imagedata && imagedata != "") {
                imagedata = imagedata
                    .replace(/^data:image\/png;base64,/, "")
                    .replace(/^data:image\/jpeg;base64,/, "");
                console.log(filename, "uploaded");
                const savingPath = getSafeFilePath(savingDir, filename);
                fs.writeFile(savingPath, imagedata, "base64", function (err) {
                    if (err) {
                        console.log("error", err);
                        callback(err);
                    } else {
                        callback();
                    }
                });
            } else {
                callback("no images!");
                console.log("No images found for this upload!", filename);
            }
        });
    }

    io.on("connection", function (socket) {
        let whiteboardId = null;
        socket.on("disconnect", function () {
            WhiteboardInfoBackendService.leave(socket.id, whiteboardId);
            socket.compress(false).broadcast.to(whiteboardId).emit("refreshUserBadges", null);
        });

        socket.on("drawToWhiteboard", function (content) {
            if (!whiteboardId || ReadOnlyBackendService.isReadOnly(whiteboardId)) return;

            content = escapeAllContentStrings(content);
            content = purifyEncodedStrings(content);

            if (accessToken === "" || accessToken == content["at"]) {
                const broadcastTo = (wid) =>
                    socket.compress(false).broadcast.to(wid).emit("drawToWhiteboard", content);
                broadcastTo(whiteboardId);
                const readOnlyId = ReadOnlyBackendService.getReadOnlyId(whiteboardId);
                broadcastTo(readOnlyId);
                s_whiteboard.handleEventsAndData(content);
            } else {
                socket.emit("wrongAccessToken", true);
            }
        });

        socket.on("joinWhiteboard", function (content) {
            content = escapeAllContentStrings(content);
            if (accessToken === "" || accessToken == content["at"]) {
                whiteboardId = content["wid"];

                socket.emit("whiteboardConfig", {
                    common: config.frontend,
                    whiteboardSpecific: {
                        correspondingReadOnlyWid:
                            ReadOnlyBackendService.getReadOnlyId(whiteboardId),
                        isReadOnly: ReadOnlyBackendService.isReadOnly(whiteboardId),
                    },
                });
                socket.join(whiteboardId);
                const screenResolution = content["windowWidthHeight"];
                WhiteboardInfoBackendService.join(socket.id, whiteboardId, screenResolution);
            } else {
                socket.emit("wrongAccessToken", true);
            }
        });

        socket.on("updateScreenResolution", function (content) {
            content = escapeAllContentStrings(content);
            if (accessToken === "" || accessToken == content["at"]) {
                const screenResolution = content["windowWidthHeight"];
                WhiteboardInfoBackendService.setScreenResolution(
                    socket.id,
                    whiteboardId,
                    screenResolution
                );
            }
        });
    });

    function escapeAllContentStrings(content, cnt) {
        if (!cnt) cnt = 0;

        if (typeof content === "string") {
            return DOMPurify.sanitize(content);
        }
        for (let i in content) {
            if (typeof content[i] === "string") {
                content[i] = DOMPurify.sanitize(content[i]);
            }
            if (typeof content[i] === "object" && cnt < 10) {
                content[i] = escapeAllContentStrings(content[i], ++cnt);
            }
        }
        return content;
    }

    function purifyEncodedStrings(content) {
        if (content.hasOwnProperty("t") && content["t"] === "setTextboxText") {
            return purifyTextboxTextInContent(content);
        }
        return content;
    }

    function purifyTextboxTextInContent(content) {
        const raw = content["d"][1];
        const decoded = base64decode(raw);
        const purified = DOMPurify.sanitize(decoded, {
            ALLOWED_TAGS: ["div", "br"],
            ALLOWED_ATTR: [],
            ALLOW_DATA_ATTR: false,
        });

        content["d"][1] = base64encode(purified);
        return content;
    }

    function base64encode(s) {
        return Buffer.from(s, "utf8").toString("base64");
    }

    function base64decode(s) {
        return Buffer.from(s, "base64").toString("utf8");
    }

    process.on("unhandledRejection", (error) => {
        console.log("unhandledRejection", error.message);
    });
}

module.exports = startBackendServer;
