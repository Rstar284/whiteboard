import { computeDist } from "../utils";

class Point {
    #x;
    get x() {
        return this.#x;
    }
    #y;
    get y() {
        return this.#y;
    }
    static #lastKnownPos = new Point(0, 0);
    static get lastKnownPos() {
        return Point.#lastKnownPos;
    }
    constructor(x, y) {
        this.#x = x;
        this.#y = y;
    }
    get isZeroZero() {
        return this.#x === 0 && this.#y === 0;
    }
    static fromEvent(e) {
        const epsilon = 0.0001;
        let x = (e.offsetX || e.pageX - $(e.target).offset().left) + epsilon;
        let y = (e.offsetY || e.pageY - $(e.target).offset().top) + epsilon;
        if (Number.isNaN(x) || Number.isNaN(y) || (x === epsilon && y === epsilon)) {
            if (e.touches && e.touches.length && e.touches.length > 0) {
                const touch = e.touches[0];
                x = touch.clientX - $("#mouseOverlay").offset().left;
                y = touch.clientY - $("#mouseOverlay").offset().top;
            } else {
                return Point.#lastKnownPos;
            }
        }

        Point.#lastKnownPos = new Point(x - epsilon, y - epsilon);
        return Point.#lastKnownPos;
    }
    distTo(otherPoint) {
        return computeDist(this, otherPoint);
    }
}

export default Point;
