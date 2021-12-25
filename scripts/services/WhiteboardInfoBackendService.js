const config = require("../config/config");
const ReadOnlyBackendService = require("./ReadOnlyBackendService");

class WhiteboardInfo {
    static defaultScreenResolution = { w: 1000, h: 1000 };
    #nbConnectedUsers = 0;
    get nbConnectedUsers() {
        return this.#nbConnectedUsers;
    }
    #screenResolutionByClients = new Map();
    get screenResolutionByClients() {
        return this.#screenResolutionByClients;
    }
    #hasNonSentUpdates = false;
    get hasNonSentUpdates() {
        return this.#hasNonSentUpdates;
    }

    incrementNbConnectedUsers() {
        this.#nbConnectedUsers++;
        this.#hasNonSentUpdates = true;
    }

    decrementNbConnectedUsers() {
        this.#nbConnectedUsers--;
        this.#hasNonSentUpdates = true;
    }

    hasConnectedUser() {
        return this.#nbConnectedUsers > 0;
    }
    setScreenResolutionForClient(clientId, { w, h }) {
        this.#screenResolutionByClients.set(clientId, { w, h });
        this.#hasNonSentUpdates = true;
    }
    deleteScreenResolutionOfClient(clientId) {
        this.#screenResolutionByClients.delete(clientId);
        this.#hasNonSentUpdates = true;
    }
    getSmallestScreenResolution() {
        const { screenResolutionByClients: resolutions } = this;
        return {
            w: Math.min(...Array.from(resolutions.values()).map((res) => res.w)),
            h: Math.min(...Array.from(resolutions.values()).map((res) => res.h)),
        };
    }
    infoWasSent() {
        this.#hasNonSentUpdates = false;
    }
    shouldSendInfo() {
        return this.#hasNonSentUpdates;
    }
    asObject() {
        const out = {
            nbConnectedUsers: this.#nbConnectedUsers,
        };

        if (config.frontend.showSmallestScreenIndicator) {
            out.smallestScreenResolution = this.getSmallestScreenResolution();
        }

        return out;
    }
}

class InfoByWhiteBoardMap extends Map {
    get(wid) {
        const readOnlyId = ReadOnlyBackendService.getReadOnlyId(wid);
        return super.get(readOnlyId);
    }
    set(wid, val) {
        const readOnlyId = ReadOnlyBackendService.getReadOnlyId(wid);
        return super.set(readOnlyId, val);
    }
    has(wid) {
        const readOnlyId = ReadOnlyBackendService.getReadOnlyId(wid);
        return super.has(readOnlyId);
    }
    delete(wid) {
        const readOnlyId = ReadOnlyBackendService.getReadOnlyId(wid);
        return super.delete(readOnlyId);
    }
}

class WhiteboardInfoBackendService {
    #infoByWhiteboard = new InfoByWhiteBoardMap();
    start(io) {
        setInterval(() => {
            this.#infoByWhiteboard.forEach((info, readOnlyWhiteboardId) => {
                if (info.shouldSendInfo()) {
                    const wid = ReadOnlyBackendService.getIdFromReadOnlyId(readOnlyWhiteboardId);
                    io.sockets
                        .in(wid)
                        .compress(false)
                        .emit("whiteboardInfoUpdate", info.asObject());
                    io.sockets
                        .in(readOnlyWhiteboardId)
                        .compress(false)
                        .emit("whiteboardInfoUpdate", info.asObject());

                    info.infoWasSent();
                }
            });
        }, (1 / config.backend.performance.whiteboardInfoBroadcastFreq) * 1000);
    }
    join(clientId, whiteboardId, screenResolution) {
        const infoByWhiteboard = this.#infoByWhiteboard;

        if (!infoByWhiteboard.has(whiteboardId)) {
            infoByWhiteboard.set(whiteboardId, new WhiteboardInfo());
        }

        const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
        whiteboardServerSideInfo.incrementNbConnectedUsers();
        this.setScreenResolution(clientId, whiteboardId, screenResolution);
    }
    setScreenResolution(clientId, whiteboardId, screenResolution) {
        const infoByWhiteboard = this.#infoByWhiteboard;

        const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);
        if (whiteboardServerSideInfo) {
            whiteboardServerSideInfo.setScreenResolutionForClient(
                clientId,
                screenResolution || WhiteboardInfo.defaultScreenResolution
            );
        }
    }
    leave(clientId, whiteboardId) {
        const infoByWhiteboard = this.#infoByWhiteboard;

        if (infoByWhiteboard.has(whiteboardId)) {
            const whiteboardServerSideInfo = infoByWhiteboard.get(whiteboardId);

            if (clientId) {
                whiteboardServerSideInfo.deleteScreenResolutionOfClient(clientId);
            }

            whiteboardServerSideInfo.decrementNbConnectedUsers();

            if (whiteboardServerSideInfo.hasConnectedUser()) {
            } else {
                infoByWhiteboard.delete(whiteboardId);
            }
        }
    }
    getNbClientOnWhiteboard(wid) {
        const infoByWhiteboard = this.#infoByWhiteboard;
        const info = infoByWhiteboard.get(wid);

        if (info) return info.nbConnectedUsers;
        else return null;
    }
}

module.exports = new WhiteboardInfoBackendService();
