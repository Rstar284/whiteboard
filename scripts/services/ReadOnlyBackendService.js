const { v4: uuidv4 } = require("uuid");

class ReadOnlyBackendService {
    _idToReadOnlyId = new Map();
    _readOnlyIdToId = new Map();
    init(whiteboardId) {
        const idToReadOnlyId = this._idToReadOnlyId;
        const readOnlyIdToId = this._readOnlyIdToId;
        if (!idToReadOnlyId.has(whiteboardId) && !readOnlyIdToId.has(whiteboardId)) {
            const readOnlyId = uuidv4();
            idToReadOnlyId.set(whiteboardId, readOnlyId);
            readOnlyIdToId.set(readOnlyId, whiteboardId);
        }
    }
    getReadOnlyId(whiteboardId) {
        if (this.isReadOnly(whiteboardId)) return whiteboardId;
        return this._idToReadOnlyId.get(whiteboardId);
    }
    getIdFromReadOnlyId(readOnlyId) {
        return this._readOnlyIdToId.get(readOnlyId);
    }
    isReadOnly(whiteboardId) {
        this.init(whiteboardId);
        return this._readOnlyIdToId.has(whiteboardId);
    }
}

module.exports = new ReadOnlyBackendService();
