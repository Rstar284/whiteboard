import keymage from "keymage";
import { io } from "socket.io-client";
import whiteboard from "./whiteboard";
import keybinds from "./keybinds";
import Picker from "vanilla-picker";
import { dom } from "@fortawesome/fontawesome-svg-core";
import shortcutFunctions from "./shortcutFunctions";
import ReadOnlyService from "./services/ReadOnlyService";
import InfoService from "./services/InfoService";
import { getSubDir } from "./utils";
import ConfigService from "./services/ConfigService";

const urlParams = new URLSearchParams(window.location.search);
let whiteboardId = urlParams.get("whiteboardid");

if (!whiteboardId) {
    whiteboardId = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
}

whiteboardId = unescape(encodeURIComponent(whiteboardId)).replace(/[^a-zA-Z0-9\-]/g, "");

if (urlParams.get("whiteboardid") !== whiteboardId) {
    urlParams.set("whiteboardid", whiteboardId);
    window.location.search = urlParams;
}

const myUsername = urlParams.get("username") || "anonymous_" + (Math.random() + "").substring(2, 6);
const accessToken = urlParams.get("accesstoken") || "";

// Custom Html Title
const title = urlParams.get("title");
if (title) {
    document.title = `Whiteboard - ${decodeURIComponent(title)}`;
}

const subdir = getSubDir();
let signaling_socket;

function main() {
    signaling_socket = io("", { path: subdir + "/ws-api" });

    signaling_socket.on("connect", function () {
        console.log("Websocket connected!");

        signaling_socket.on("whiteboardConfig", (serverResponse) => {
            ConfigService.initFromServer(serverResponse);
            initWhiteboard();
        });

        signaling_socket.on("whiteboardInfoUpdate", (info) => {
            InfoService.updateInfoFromServer(info);
            whiteboard.updateSmallestScreenResolution();
        });

        signaling_socket.on("drawToWhiteboard", function (content) {
            whiteboard.handleEventsAndData(content, true);
            InfoService.incrementNbMessagesReceived();
        });

        signaling_socket.on("refreshUserBadges", function () {
            whiteboard.refreshUserBadges();
        });

        let accessDenied = false;
        signaling_socket.on("wrongAccessToken", function () {
            if (!accessDenied) {
                accessDenied = true;
                showBasicAlert("Access denied! Wrong accessToken!");
            }
        });

        signaling_socket.emit("joinWhiteboard", {
            wid: whiteboardId,
            at: accessToken,
            windowWidthHeight: { w: $(window).width(), h: $(window).height() },
        });
    });
}

function showBasicAlert(html, newOptions) {
    let options = {
        header: "Info",
        okBtnText: "Ok",
        headercolor: "#d25d5d",
        hideAfter: false,
        onOkClick: false,
    };
    if (newOptions) {
        for (let i in newOptions) {
            options[i] = newOptions[i];
        }
    }
    let alertHtml = $(
        '<div class="basicalert" style="position:absolute; left:0px; width:100%; top:70px; font-family: monospace;">' +
            '<div style="width: 30%; margin: auto; background: #aaaaaa; border-radius: 5px; font-size: 1.2em; border: 1px solid gray;">' +
            '<div style="border-bottom: 1px solid #676767; background: ' +
            options["headercolor"] +
            '; padding-left: 5px; font-size: 0.8em;">' +
            options["header"] +
            '<div style="float: right; margin-right: 4px; color: #373737; cursor: pointer;" class="closeAlert">x</div></div>' +
            '<div style="padding: 10px;" class="htmlcontent"></div>' +
            '<div style="height: 20px; padding: 10px;"><button class="modalBtn okbtn" style="float: right;">' +
            options["okBtnText"] +
            "</button></div>" +
            "</div>" +
            "</div>"
    );
    alertHtml.find(".htmlcontent").append(html);
    $("body").append(alertHtml);
    alertHtml
        .find(".okbtn")
        .off("click")
        .click(function () {
            if (options.onOkClick) {
                options.onOkClick();
            }
            alertHtml.remove();
        });
    alertHtml
        .find(".closeAlert")
        .off("click")
        .click(function () {
            alertHtml.remove();
        });

    if (options.hideAfter) {
        setTimeout(function () {
            alertHtml.find(".okbtn").click();
        }, 1000 * options.hideAfter);
    }
}

function initWhiteboard() {
    $(document).ready(function () {
        ReadOnlyService.activateReadOnlyMode();
        whiteboard.loadWhiteboard("#whiteboardContainer", {
            //Load the whiteboard
            whiteboardId: whiteboardId,
            username: btoa(encodeURIComponent(myUsername)),
            backgroundGridUrl: "./images/" + ConfigService.backgroundGridImage,
            sendFunction: function (content) {
                if (ReadOnlyService.readOnlyActive) return;
                content["at"] = accessToken;
                signaling_socket.emit("drawToWhiteboard", content);
                InfoService.incrementNbMessagesSent();
            },
        });

        // request whiteboard from server
        $.get(subdir + "/api/loadwhiteboard", { wid: whiteboardId, at: accessToken }).done(
            function (data) {
                console.log(data);
                whiteboard.loadData(data);
            }
        );

        $(window).resize(function () {
            signaling_socket.emit("updateScreenResolution", {
                at: accessToken,
                windowWidthHeight: { w: $(window).width(), h: $(window).height() },
            });
        });

        let tempLineTool = false;
        let strgPressed = false;
        //Handle key actions
        $(document).on("keydown", function (e) {
            if (e.which == 16) {
                if (whiteboard.tool == "pen" && !strgPressed) {
                    tempLineTool = true;
                    whiteboard.ownCursor.hide();
                    if (whiteboard.drawFlag) {
                        whiteboard.mouseup({
                            offsetX: whiteboard.prevPos.x,
                            offsetY: whiteboard.prevPos.y,
                        });
                        shortcutFunctions.setTool_line();
                        whiteboard.mousedown({
                            offsetX: whiteboard.prevPos.x,
                            offsetY: whiteboard.prevPos.y,
                        });
                    } else {
                        shortcutFunctions.setTool_line();
                    }
                }
                whiteboard.pressedKeys["shift"] = true; //Used for straight lines...
            } else if (e.which == 17) {
                strgPressed = true;
            }
        });
        $(document).on("keyup", function (e) {
            if (e.which == 16) {
                if (tempLineTool) {
                    tempLineTool = false;
                    shortcutFunctions.setTool_pen();
                    whiteboard.ownCursor.show();
                }
                whiteboard.pressedKeys["shift"] = false;
            } else if (e.which == 17) {
                strgPressed = false;
            }
        });

        //Load keybindings from keybinds.js to given functions
        Object.entries(keybinds).forEach(([key, functionName]) => {
            const associatedShortcutFunction = shortcutFunctions[functionName];
            if (associatedShortcutFunction) {
                keymage(key, associatedShortcutFunction, { preventDefault: true });
            } else {
                console.error(
                    "Function you want to keybind on key:",
                    key,
                    "named:",
                    functionName,
                    "is not available!"
                );
            }
        });

        // whiteboard clear button
        $("#whiteboardTrashBtn")
            .off("click")
            .click(function () {
                $("#whiteboardTrashBtnConfirm").show().focus();
                $(this).hide();
            });

        $("#whiteboardTrashBtnConfirm").mouseout(function () {
            $(this).hide();
            $("#whiteboardTrashBtn").show();
        });

        $("#whiteboardTrashBtnConfirm")
            .off("click")
            .click(function () {
                $(this).hide();
                $("#whiteboardTrashBtn").show();
                whiteboard.clearWhiteboard();
            });

        // undo button
        $("#whiteboardUndoBtn")
            .off("click")
            .click(function () {
                whiteboard.undoWhiteboardClick();
            });

        // redo button
        $("#whiteboardRedoBtn")
            .off("click")
            .click(function () {
                whiteboard.redoWhiteboardClick();
            });

        // view only
        $("#whiteboardLockBtn")
            .off("click")
            .click(() => {
                ReadOnlyService.deactivateReadOnlyMode();
            });
        $("#whiteboardUnlockBtn")
            .off("click")
            .click(() => {
                ReadOnlyService.activateReadOnlyMode();
            });
        $("#whiteboardUnlockBtn").hide();
        $("#whiteboardLockBtn").show();

        // switch tool
        $(".whiteboard-tool")
            .off("click")
            .click(function () {
                $(".whiteboard-tool").removeClass("active");
                $(this).addClass("active");
                let activeTool = $(this).attr("tool");
                whiteboard.setTool(activeTool);
                if (activeTool == "text") {
                    $("#textboxBackgroundColorPickerBtn").show();
                } else {
                    $("#textboxBackgroundColorPickerBtn").hide();
                }
            });

        // upload image button
        $("#addImgToCanvasBtn")
            .off("click")
            .click(function () {
                if (ReadOnlyService.readOnlyActive) return;
                showBasicAlert("Please drag the image into the browser.");
            });

        // save image
        $("#saveAsImageBtn")
            .off("click")
            .click(function () {
                whiteboard.getImageDataBase64(
                    {
                        imageFormat: ConfigService.imageDownloadFormat,
                        drawBackgroundGrid: ConfigService.drawBackgroundGrid,
                    },
                    function (imgData) {
                        let w = window.open("about:blank"); //Firefox will not allow downloads without extra window
                        setTimeout(function () {
                            let a = document.createElement("a");
                            a.href = imgData;
                            a.download = "whiteboard." + ConfigService.imageDownloadFormat;
                            w.document.body.appendChild(a);
                            a.click();
                            w.document.body.removeChild(a);
                            setTimeout(function () {
                                w.close();
                            }, 100);
                        }, 0);
                    }
                );
            });

        $("#shareWhiteboardBtn")
            .off("click")
            .click(() => {
                function urlToClipboard(whiteboardId = null) {
                    const { protocol, host, pathname, search } = window.location;
                    const basePath = `${protocol}//${host}${pathname}`;
                    const getParams = new URLSearchParams(search);
                    getParams.delete("username");

                    if (whiteboardId) {
                        getParams.set("whiteboardid", whiteboardId);
                    }

                    const url = `${basePath}?${getParams.toString()}`;
                    $("<textarea/>")
                        .appendTo("body")
                        .val(url)
                        .select()
                        .each(() => {
                            document.execCommand("copy");
                        })
                        .remove();
                }
                $("#shareWhiteboardDialogMessage").toggleClass("displayNone", true);

                $("#shareWhiteboardDialog").toggleClass("displayNone", false);
                $("#shareWhiteboardDialogGoBack")
                    .off("click")
                    .click(() => {
                        $("#shareWhiteboardDialog").toggleClass("displayNone", true);
                    });

                $("#shareWhiteboardDialogCopyReadOnlyLink")
                    .off("click")
                    .click(() => {
                        urlToClipboard(ConfigService.correspondingReadOnlyWid);

                        $("#shareWhiteboardDialogMessage")
                            .toggleClass("displayNone", false)
                            .text("Read-only link copied to clipboard ✓");
                    });

                $("#shareWhiteboardDialogCopyReadWriteLink")
                    .toggleClass("displayNone", ConfigService.isReadOnly)
                    .click(() => {
                        $("#shareWhiteboardDialogMessage")
                            .toggleClass("displayNone", false)
                            .text("Read/write link copied to clipboard ✓");
                        urlToClipboard();
                    });
            });

        /* For Debug, TODO: remove
        $("#displayWhiteboardInfoBtn")
            .off("click")
            .click(() => {
                InfoService.toggleDisplayInfo();
            });*/

        let btnsMini = false;
        $("#minMaxBtn")
            .off("click")
            .click(function () {
                if (!btnsMini) {
                    $("#toolbar").find(".btn-group:not(.minGroup)").hide();
                    $(this).find("#minBtn").hide();
                    $(this).find("#maxBtn").show();
                } else {
                    $("#toolbar").find(".btn-group").show();
                    $(this).find("#minBtn").show();
                    $(this).find("#maxBtn").hide();
                }
                btnsMini = !btnsMini;
            });

        // On thickness slider change
        $("#whiteboardThicknessSlider").on("input", function () {
            if (ReadOnlyService.readOnlyActive) return;
            whiteboard.setStrokeThickness($(this).val());
        });

        // handle drag&drop
        let dragCounter = 0;
        $("#whiteboardContainer").on("dragenter", function (e) {
            if (ReadOnlyService.readOnlyActive) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            whiteboard.dropIndicator.show();
        });

        $("#whiteboardContainer").on("dragleave", function (e) {
            if (ReadOnlyService.readOnlyActive) return;

            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter === 0) {
                whiteboard.dropIndicator.hide();
            }
        });

        $("#whiteboardContainer").on("drop", function (e) {
            //Handle drop
            if (ReadOnlyService.readOnlyActive) return;

            if (e.originalEvent.dataTransfer) {
                if (e.originalEvent.dataTransfer.files.length) {
                    e.preventDefault();
                    e.stopPropagation();
                    let filename = e.originalEvent.dataTransfer.files[0]["name"];
                    if (isImageFileName(filename)) {
                        let blob = e.originalEvent.dataTransfer.files[0];
                        let reader = new window.FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = function () {
                            const base64data = reader.result;
                            uploadImgAndAddToWhiteboard(base64data);
                        };
                    } else {
                        showBasicAlert("File must be an image!");
                    }
                } else {
                    let fileUrl = e.originalEvent.dataTransfer.getData("URL");
                    let imageUrl = e.originalEvent.dataTransfer.getData("text/html");
                    let rex = /src="?([^"\s]+)"?\s*/;
                    let url = rex.exec(imageUrl);
                    if (url && url.length > 1) {
                        url = url[1];
                    } else {
                        url = "";
                    }

                    isValidImageUrl(fileUrl, function (isImage) {
                        if (isImage && isImageFileName(url)) {
                            whiteboard.addImgToCanvasByUrl(fileUrl);
                        } else {
                            isValidImageUrl(url, function (isImage) {
                                if (isImage) {
                                    if (isImageFileName(url) || url.startsWith("http")) {
                                        whiteboard.addImgToCanvasByUrl(url);
                                    } else {
                                        uploadImgAndAddToWhiteboard(url);
                                    }
                                } else {
                                    showBasicAlert("Can only upload Images!");
                                }
                            });
                        }
                    });
                }
            }
            dragCounter = 0;
            whiteboard.dropIndicator.hide();
        });

        if (!localStorage.getItem("savedColors")) {
            localStorage.setItem(
                "savedColors",
                JSON.stringify([
                    "rgba(0, 0, 0, 1)",
                    "rgba(255, 255, 255, 1)",
                    "rgba(255, 0, 0, 1)",
                    "rgba(0, 255, 0, 1)",
                    "rgba(0, 0, 255, 1)",
                    "rgba(255, 255, 0, 1)",
                    "rgba(255, 0, 255, 1)",
                ])
            );
        }

        let colorPickerOnOpen = function (current_color) {
            this._domPalette = $(".picker_palette", this.domElement);
            const palette = JSON.parse(localStorage.getItem("savedColors"));
            if ($(".picker_splotch", this._domPalette).length === 0) {
                for (let i = 0; i < palette.length; i++) {
                    let palette_Color_obj = new this.color.constructor(palette[i]);
                    let splotch_div = $(
                        '<div style="position:relative;"><span position="' +
                            i +
                            '" class="removeColor" style="position:absolute; cursor:pointer; right:-1px; top:-4px;">x</span></div>'
                    )
                        .addClass("picker_splotch")
                        .attr({
                            id: "s" + i,
                        })
                        .css("background-color", palette_Color_obj.hslaString)
                        .on("click", { that: this, obj: palette_Color_obj }, function (e) {
                            e.data.that._setColor(e.data.obj.hslaString);
                        });
                    splotch_div.find(".removeColor").on("click", function (e) {
                        e.preventDefault();
                        $(this).parent("div").remove();
                        palette.splice(i, 1);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    });
                    this._domPalette.append(splotch_div);
                }
            }
        };

        const colorPickerTemplate = `
        <div class="picker_wrapper" tabindex="-1">
          <div class="picker_arrow"></div>
          <div class="picker_hue picker_slider">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_sl">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_alpha picker_slider">
            <div class="picker_selector"></div>
          </div>
          <div class="picker_palette"></div>
          <div class="picker_editor">
            <input aria-label="Type a color name or hex value"/>
          </div>
          <div class="picker_sample"></div>
          <div class="picker_done">
            <button>Ok</button>
          </div>
          <div class="picker_cancel">
            <button>Cancel</button>
          </div>
        </div>
      `;

        let colorPicker = null;
        function initColorPicker(initColor) {
            if (colorPicker) {
                colorPicker.destroy();
            }
            colorPicker = new Picker({
                parent: $("#whiteboardColorpicker")[0],
                color: initColor || "#000000",
                onChange: function (color) {
                    whiteboard.setDrawColor(color.rgbaString);
                },
                onDone: function (color) {
                    let palette = JSON.parse(localStorage.getItem("savedColors"));
                    if (!palette.includes(color.rgbaString)) {
                        palette.push(color.rgbaString);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    }
                    initColorPicker(color.rgbaString);
                },
                onOpen: colorPickerOnOpen,
                template: colorPickerTemplate,
            });
        }
        initColorPicker();

        let bgColorPicker = null;
        function initBgColorPicker(initColor) {
            if (bgColorPicker) {
                bgColorPicker.destroy();
            }
            bgColorPicker = new Picker({
                parent: $("#textboxBackgroundColorPicker")[0],
                color: initColor || "#f5f587",
                bgcolor: initColor || "#f5f587",
                onChange: function (bgcolor) {
                    whiteboard.setTextBackgroundColor(bgcolor.rgbaString);
                },
                onDone: function (bgcolor) {
                    let palette = JSON.parse(localStorage.getItem("savedColors"));
                    if (!palette.includes(color.rgbaString)) {
                        palette.push(color.rgbaString);
                        localStorage.setItem("savedColors", JSON.stringify(palette));
                    }
                    initBgColorPicker(color.rgbaString);
                },
                onOpen: colorPickerOnOpen,
                template: colorPickerTemplate,
            });
        }
        initBgColorPicker();

        // on startup select mouse
        shortcutFunctions.setTool_mouse();
        whiteboard.refreshCursorAppearance();
        if (process.env.NODE_ENV === "production") {
            if (ConfigService.readOnlyOnWhiteboardLoad) ReadOnlyService.activateReadOnlyMode();
            else ReadOnlyService.deactivateReadOnlyMode();
            InfoService.hideInfo();
        } else {
            ReadOnlyService.deactivateReadOnlyMode();
            InfoService.displayInfo()
        }
        if (ConfigService.isReadOnly) ReadOnlyService.activateReadOnlyMode();

        $("body").show();
    });

    //Prevent site from changing tab on drag/drop
    window.addEventListener(
        "dragover",
        function (e) {
            e = e || event;
            e.preventDefault();
        },
        false
    );
    window.addEventListener(
        "drop",
        function (e) {
            e = e || event;
            e.preventDefault();
        },
        false
    );

    function uploadImgAndAddToWhiteboard(base64data) {
        const date = +new Date();
        $.ajax({
            type: "POST",
            url: document.URL.substr(0, document.URL.lastIndexOf("/")) + "/api/upload",
            data: {
                imagedata: base64data,
                whiteboardId: whiteboardId,
                date: date,
                at: accessToken,
            },
            success: function (msg) {
                const { correspondingReadOnlyWid } = ConfigService;
                const filename = `${correspondingReadOnlyWid}_${date}.png`;
                const rootUrl = document.URL.substr(0, document.URL.lastIndexOf("/"));
                whiteboard.addImgToCanvasByUrl(
                    `${rootUrl}/uploads/${correspondingReadOnlyWid}/${filename}`
                ); //Add image to canvas
                console.log("Image uploaded!");
            },
            error: function (err) {
                showBasicAlert("Failed to upload image: " + JSON.stringify(err));
            },
        });
    }

    // verify if filename refers to an image
    function isImageFileName(filename) {
        let extension = filename.split(".")[filename.split(".").length - 1];
        let known_extensions = ["png", "jpg", "jpeg", "gif", "tiff", "bmp", "webp"];
        return known_extensions.includes(extension.toLowerCase());
    }
    function isValidImageUrl(url, callback) {
        let img = new Image();
        let timer = null;
        img.onerror = img.onabort = function () {
            clearTimeout(timer);
            callback(false);
        };
        img.onload = function () {
            clearTimeout(timer);
            callback(true);
        };
        timer = setTimeout(function () {
            callback(false);
        }, 2000);
        img.src = url;
    }

    // handle pasting from clipboard
    window.addEventListener("paste", function (e) {
        if ($(".basicalert").length > 0 || !!e.origin) {
            return;
        }
        if (e.clipboardData) {
            let items = e.clipboardData.items;
            let imgItemFound = false;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf("image") !== -1) {
                        imgItemFound = true;
                        let blob = items[i].getAsFile();
                        let reader = new window.FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = function () {
                            console.log("Uploading image!");
                            let base64data = reader.result;
                            uploadImgAndAddToWhiteboard(base64data);
                        };
                    }
                }
            }

            if (!imgItemFound && whiteboard.tool != "text") {
                showBasicAlert(
                    "Please Drag/Drop the image into the Whiteboard."
                );
            }
        }
    });
}

export default main;
