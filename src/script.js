class FastMath {
  static min2(a, b) {
    return a < b ? a : b;
  }

  static max2(a, b) {
    return a > b ? a : b;
  }

  static min4(a, b, c, d) {
    if (a < b && a < c && a < d) return a;
    if (b < c && b < d) return b;
    return c < d ? c : d;
  }

  static max4(a, b, c, d) {
    if (a > b && a > c && a > d) return a;
    if (b > c && b > d) return b;
    return c > d ? c : d;
  }

  static clamp(x, min, max) {
    return x < min ? min : x > max ? max : x;
  }
}

class GeoUtils {
  static DEG_RAD = Math.PI / 180;
  static RAD_DEG = 180 / Math.PI;

  static MAX_X = 67108864;
  static MAX_Y = 67108864;
  static MAX_LEVEL = 19;
  static EARTH_RADIUS = 6371000; // in meters

  static C_LONGITUDE = 360 / this.MAX_X;
  static C_LATITUDE = (2 * Math.PI) / this.MAX_Y;
  static C_LATITUDE2 = this.MAX_Y / 2;

  /** Converts x coordinate to lon. **/
  static x2lon(x) {
    return x * this.C_LONGITUDE - 180;
  }

  /** Converts lon to x coordinate. **/
  static lon2x(lon) {
    return (lon + 180) / this.C_LONGITUDE;
  }

  /** Converts y coordinate to lat. **/
  static y2lat(y) {
    return Math.atan(this.sinh(Math.PI - this.C_LATITUDE * y)) * this.RAD_DEG;
  }

  /** Converts lat to y coordinate. **/
  static lat2y(lat) {
    const rad = lat * this.DEG_RAD;
    return (
      (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) *
      this.C_LATITUDE2
    );
  }

  /** Returns the hyperbolic sine of value. **/
  static sinh(value) {
    return (Math.exp(value) - Math.exp(-value)) / 2;
  }

  static lon2tileX(lon, zoom) {
    const n = Math.pow(2, zoom);
    return this.clampRotation(parseInt((n * (lon + 180)) / 360), 0, n);
  }

  static lat2tileY(lat, zoom) {
    const n = Math.pow(2, zoom);
    const max = n - 1;
    const latRad = lat * this.DEG_RAD;
    const result = parseInt(
      (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) /
        2
    );
    return isNaN(result) ? max : FastMath.clamp(result, 0, max);
  }

  static clampLat(value) {
    return FastMath.clamp(value, -90, 90);
  }

  static clampLon(value) {
    return this.clampRotation(value, -180, 180);
  }

  static clampRotation(value, min, max) {
    const range = max - min;
    const result = ((value + max) % range) + min;
    return result < min ? range + result : result;
  }

  static clampTileX(x, zoom) {
    return this.clampRotation(x, 0, Math.pow(2, zoom));
  }
}

class Geometry {
  static linesIntersection(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const d = (by2 - by1) * (ax2 - ax1) - (bx2 - bx1) * (ay2 - ay1);
    if (d == 0) return null;
    const c = ((bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1)) / d;
    return { x: ax1 + c * (ax2 - ax1), y: ay1 + c * (ay2 - ay1) };
  }

  static pointInsideTriangle(x, y, x1, y1, x2, y2, x3, y3) {
    const dx = x - x1,
      dy = y - y1,
      b = (x2 - x1) * dy - (y2 - y1) * dx > 0;
    return (
      (x3 - x1) * dy - (y3 - y1) * dx > 0 != b &&
      (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2) > 0 == b
    );
  }

  /** Rectangles are considered to have points on same x and y axes. Provide topLeft, bottomRight **/
  static rectangleIntersectsRectangle(ax1, ay1, ax3, ay3, bx1, by1, bx2, by2) {
    return ax1 <= bx2 && ax3 >= bx1 && ay1 <= by2 && ay3 >= by1;
  }

  static distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

class Globe {
  constructor() {}

  init(container, transform) {
    this.container = container;
    this.transform = transform;
    this.layers = new Map();
    this.virtualGenerator = new SceneGenerator(8);
    this.virtualGenerator.updateViewport({ x: 0, y: 0 });
  }

  createLayer(level) {
    const result = new Layer(level);
    const container = result.createContainer();
    const viewport = this.container.getBoundingClientRect();
    this.container.appendChild(container);
    result.init(container, viewport);
    return result;
  }

  prepareLayer(level) {
    let result = this.layers.get(level);
    if (result) return result;
    result = this.createLayer(level);
    this.layers.set(level, result);
    return result;
  }

  deleteLayer(layer) {
    this.container.removeChild(layer.container);
    this.layers.delete(layer.level);
  }

  render() {
    if (!this.lockLevel) {
      const level = (this.currentLevel = this.getOptimalLevel());
      for (const layer of this.layers.values())
        if (layer.level != level) this.deleteLayer(layer);
    }

    const layer = (this.currentLayer = this.prepareLayer(this.currentLevel));
    for (const layer of this.layers.values()) layer.render(this.transform);
  }

  getOptimalLevel() {
    const generator = this.virtualGenerator;
    generator.updateTransform(this.transform);
    const { x1, x2, x3, x4 } = generator.getCenterRectangle();
    const length =
      FastMath.max2(Math.abs(x2 - x1), Math.abs(x4 - x3)) *
      generator.globalScale;
    const level =
      Math.log2((generator.descale / Layer.SEGMENT_SIZE) * length) +
      SceneGenerator.BASE_LEVEL;
    return FastMath.clamp(parseInt(level), Layer.MIN_LEVEL, Layer.MAX_LEVEL);
  }

  rotate(lat, lon) {
    this.transform.lat = GeoUtils.clampLat(lat);
    this.transform.lon = GeoUtils.clampLon(lon);
  }

  scale(value) {
    this.transform.scale = value;
  }
}

class Layer {
  static SEGMENT_SIZE = 256;
  static MIN_LEVEL = 4;
  static MAX_LEVEL = 19;

  constructor(level) {
    this.level = level;
    this.generator = new SceneGenerator(this.level);
  }

  init(container, viewport) {
    this.container = container;
    const offset = container.getBoundingClientRect();
    this.generator.updateViewport(offset, viewport);
  }

  createContainer() {
    const result = document.createElement("div");
    result.className = this.constructor.name + " level-" + this.level;
    return result;
  }

  createTile(rect) {
    const result = document.createElement("img");
    //result.src = `https://tile.openstreetmap.org/${this.level}/${rect.x}/${rect.y}.png`;
    //result.src = `http://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${this.level}/${rect.y}/${rect.x}`
    (result.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${this.level}/${rect.y}/${rect.x}.png`),
      (result.rect = rect);
    this.transformTile(result);
    return result;
  }

  render(transform) {
    const rendered = this.renderedTransform;
    const projectionChanged =
      !rendered ||
      rendered.lat != transform.lat ||
      rendered.lon != transform.lon;
    const scaleChanged = !rendered || rendered.scale != transform.scale;
    if (!projectionChanged && !scaleChanged) return;

    this.generator.updateTransform(transform);
    this.renderTiles();
    if (scaleChanged)
      this.container.style.transform = `scale(${this.generator.globalScale})`;

    this.renderedTransform = {
      lat: transform.lat,
      lon: transform.lon,
      scale: transform.scale
    };
  }

  transformTile(tile) {
    const rect = tile.rect;
    tile.style.transform = PerspectiveTransform.toMatrix3DCSS(
      this.constructor.SEGMENT_SIZE,
      rect.x1,
      rect.y1,
      rect.x2,
      rect.y2,
      rect.x3,
      rect.y3,
      rect.x4,
      rect.y4
    );
  }

  renderTiles() {
    const rects = this.generator.getRectangles();
    const elements = [...this.container.children];

    // 1. reuse existing elements
    for (let i = elements.length - 1; i >= 0; i--) {
      const tile = elements[i];
      const rect = rects.get(tile.rect.x, tile.rect.y);
      if (rect) {
        tile.rect = rect;
        this.transformTile(tile);
        rects.delete(rect.x, rect.y);
        elements.splice(i, 1);
      }
    }

    // 2. remove unused elements
    for (const tile of elements) this.container.removeChild(tile);

    // 3. add missing elements
    const fragment = document.createDocumentFragment();
    rects.forEach((rect) => fragment.appendChild(this.createTile(rect)));
    this.container.appendChild(fragment);
  }

  getSceneSnapshot() {
    const result = [];
    for (const tile of this.container.children) result.push(tile.rect);
    return result;
  }

  getLocalTriangle(localX, localY, scene) {
    for (const {
      x1,
      y1,
      x2,
      y2,
      x3,
      y3,
      x4,
      y4,
      lon0,
      lon1,
      lat0,
      lat1
    } of scene) {
      if (Geometry.pointInsideTriangle(localX, localY, x1, y1, x2, y2, x3, y3))
        return { x1, y1, x2, y2, x3, y3, lon0, lon1, lat0, lat1 };
      if (Geometry.pointInsideTriangle(localX, localY, x4, y4, x2, y2, x3, y3))
        return {
          x1: x4,
          y1: y4,
          x2: x3,
          y2: y3,
          x3: x2,
          y3: y2,
          lon0: lon1,
          lon1: lon0,
          lat0: lat1,
          lat1: lat0
        };
    }
  }

  getLatLon(globalX, globalY, scene) {
    const x = this.generator.globalToLocalX(globalX);
    const y = this.generator.globalToLocalY(globalY);
    const triangle = this.getLocalTriangle(x, y, scene);
    if (!triangle) return;
    const { x1, y1, x2, y2, x3, y3, lon0, lon1, lat0, lat1 } = triangle;
    const ix = Geometry.linesIntersection(x1, y1, x3, y3, x2, y2, x, y);
    const iy = Geometry.linesIntersection(x1, y1, x2, y2, x3, y3, x, y);
    const dx = Geometry.distance(ix.x, ix.y, x2, y2);
    const dy = Geometry.distance(iy.x, iy.y, x3, y3);
    return {
      lon: lon1 - (Geometry.distance(x, y, x2, y2) / dx) * (lon1 - lon0),
      lat: lat1 - (Geometry.distance(x, y, x3, y3) / dy) * (lat1 - lat0)
    };
  }
}

class PerspectiveTransform {
  static toMatrix3DCSS(s, x1, y1, x2, y2, x3, y3, x4, y4) {
    const a = (y2 - y3) * x4 + (x3 - x2) * y4 + x2 * y3 - x3 * y2,
      b = (y3 - y1) * x4 + (x1 - x3) * y4 + x3 * y1 - x1 * y3,
      c = (y1 - y2) * x4 + (x2 - x1) * y4 + x1 * y2 - x2 * y1,
      d = -a * s,
      f = x1 * a,
      g = y1 * a;
    return (
      "matrix3d(" +
      (f + x2 * b) / d +
      "," +
      (g + y2 * b) / d +
      ",0," +
      (a + b) / d +
      "," +
      (f + x3 * c) / d +
      "," +
      (g + y3 * c) / d +
      ",0," +
      (a + c) / d +
      "," +
      "0,0,1,0," +
      x1 +
      "," +
      y1 +
      ",0,1)"
    );
  }
}

class SceneGenerator {
  /** at base level, base radius is used unscaled **/
  static BASE_LEVEL = 3;

  static BASE_RADIUS = 256;

  static BASE_PERSPECTIVE = 1000;

  static BASE_EXPAND = 0.2;

  constructor(level) {
    this.level = level;
    this.descale = Math.pow(2, this.level - this.constructor.BASE_LEVEL);
    this.radius = this.constructor.BASE_RADIUS * this.descale;
    this.segments = Math.pow(2, level);
    this.rectangles = new XYMap(GeoUtils.MAX_LEVEL);
    this.vertices = new XYMap(GeoUtils.MAX_LEVEL);
    this.perspective = this.constructor.BASE_PERSPECTIVE;
  }

  updateTransform(transform) {
    this.transform = transform;
    this.transformTrigonometry = this.calcTrigonometry();
    this.globalScale = this.transform.scale / this.descale;
  }

  updateViewport(globalOffset, globalViewport) {
    this.globalOffset = globalOffset;
    this.globalViewport = globalViewport;
  }

  calcTrigonometry() {
    const { lat, lon } = this.transform;
    const rX = (lat / 180) * Math.PI;
    const rY = ((GeoUtils.clampLon(lon) - 270) / 180) * Math.PI;
    const rZ = 0;
    return {
      sinRY: Math.sin(rY),
      sinRX: Math.sin(-rX),
      sinRZ: Math.sin(rZ),
      cosRY: Math.cos(rY),
      cosRX: Math.cos(-rX),
      cosRZ: Math.cos(rZ)
    };
  }

  createVertex(x, y) {
    const lat = GeoUtils.y2lat((y / this.segments) * GeoUtils.MAX_Y);
    const lon = GeoUtils.x2lon((x / this.segments) * GeoUtils.MAX_X);
    return this.createVertexLatLon(lat, lon);
  }

  createVertexLatLon(lat, lon) {
    const theta = ((1 - lat / 90) / 2) * Math.PI;
    const phi = (lon / 360 + 0.5) * 2 * Math.PI;
    const sinTheta = Math.sin(theta);
    const x0 = -this.radius * Math.cos(phi) * sinTheta;
    const y0 = -this.radius * Math.cos(theta);
    const z0 = this.radius * Math.sin(phi) * sinTheta;

    // rotation
    const {
      sinRY,
      sinRX,
      sinRZ,
      cosRY,
      cosRX,
      cosRZ
    } = this.transformTrigonometry;
    const x = x0 * cosRY - z0 * sinRY;
    const zt = z0 * cosRY + x0 * sinRY;
    const y = y0 * cosRX - zt * sinRX;
    const z = zt * cosRX + y0 * sinRX;

    // projection
    const offset = 1 + z / this.perspective / this.descale;
    return {
      lat,
      lon,
      x: (x * cosRZ - y * sinRZ) * offset,
      y: (y * cosRZ + x * sinRZ) * offset
    };
  }

  prepareVertex(x, y) {
    return (
      this.vertices.get(x, y) ||
      this.vertices.add(x, y, this.createVertex(x, y))
    );
  }

  getRectangles() {
    const { x, y, width, height } = this.globalViewport;
    this.localViewport = {
      x1: this.globalToLocalX(x),
      y1: this.globalToLocalY(y),
      x4: this.globalToLocalX(x + width),
      y4: this.globalToLocalY(y + height)
    };
    this.rectangles.clear();
    this.vertices.clear();
    this.generateRectangles(this.getCenterTileX(), this.getCenterTileY());
    return this.rectangles;
  }

  getCenterTileX() {
    return GeoUtils.lon2tileX(this.transform.lon, this.level);
  }

  getCenterTileY() {
    return GeoUtils.lat2tileY(this.transform.lat, this.level);
  }

  getCenterRectangle() {
    return this.createRectangle(this.getCenterTileX(), this.getCenterTileY());
  }

  createRectangle(x, y) {
    const v1 = this.createVertex(x, y);
    const v2 = this.createVertex(x + 1, y);
    const v3 = this.createVertex(x, y + 1);
    const v4 = this.createVertex(x + 1, y + 1);
    return {
      x,
      y,
      x1: v1.x,
      y1: v1.y,
      x2: v2.x,
      y2: v2.y,
      x3: v3.x,
      y3: v3.y,
      x4: v4.x,
      y4: v4.y,
      lon0: v1.lon,
      lat0: v1.lat,
      lon1: v4.lon,
      lat1: v4.lat
    };
  }

  generateRectangles(x, y) {
    if (this.rectangles.has(x, y)) return;
    const rect = this.createRectangle(x, y);
    this.expandRectangle(rect);
    if (!this.validateRectangle(rect)) return;

    this.rectangles.add(x, y, rect);
    this.generateRectangles(GeoUtils.clampTileX(x + 1, this.level), y);
    this.generateRectangles(GeoUtils.clampTileX(x - 1, this.level), y);
    if (y + 1 < this.segments) this.generateRectangles(x, y + 1);
    if (y > 0) this.generateRectangles(x, y - 1);
  }

  /** a bit of expansion to avoid rendered "wires" **/
  expandRectangle(rect) {
    const { x, y } = Geometry.linesIntersection(
      rect.x1,
      rect.y1,
      rect.x4,
      rect.y4,
      rect.x2,
      rect.y2,
      rect.x3,
      rect.y3
    );
    const e = -this.constructor.BASE_EXPAND;
    rect.x1 += x > rect.x1 ? e : x < rect.x1 ? -e : 0;
    rect.y1 += y > rect.y1 ? e : y < rect.y1 ? -e : 0;
    rect.x2 += x > rect.x2 ? e : x < rect.x2 ? -e : 0;
    rect.y2 += y > rect.y2 ? e : y < rect.y2 ? -e : 0;
    rect.x3 += x > rect.x3 ? e : x < rect.x3 ? -e : 0;
    rect.y3 += y > rect.y3 ? e : y < rect.y3 ? -e : 0;
    rect.x4 += x > rect.x4 ? e : x < rect.x4 ? -e : 0;
    rect.y4 += y > rect.y4 ? e : y < rect.y4 ? -e : 0;
  }

  validateRectangle(rect) {
    const { x1, y1, x2, y2, x3, y3, x4, y4 } = rect;
    const view = this.localViewport;
    return (
      Geometry.rectangleIntersectsRectangle(
        FastMath.min4(x1, x2, x3, x4),
        FastMath.min4(y1, y2, y3, y4),
        FastMath.max4(x1, x2, x3, x4),
        FastMath.max4(y1, y2, y3, y4),
        view.x1,
        view.y1,
        view.x4,
        view.y4
      ) && this.isFrontFacing(x1, y1, x2, y2, x3, y3, x4, y4)
    );
  }

  localToGlobalX(x) {
    return this.globalOffset.x + x * this.globalScale;
  }

  localToGlobalY(y) {
    return this.globalOffset.y + y * this.globalScale;
  }

  globalToLocalX(x) {
    return (x - this.globalOffset.x) / this.globalScale;
  }

  globalToLocalY(y) {
    return (y - this.globalOffset.y) / this.globalScale;
  }

  getDeterminant(x1, y1, x2, y2, x3, y3) {
    return x1 * y2 + x2 * y3 + x3 * y1 - y1 * x2 - y2 * x3 - y3 * x1;
  }

  isFrontFacing(x1, y1, x2, y2, x3, y3, x4, y4) {
    return (
      this.getDeterminant(x1, y1, x2, y2, x4, y4) > 0 &&
      this.getDeterminant(x4, y4, x3, y3, x1, y1) > 0 &&
      this.getDeterminant(x2, y2, x4, y4, x3, y3) > 0 &&
      this.getDeterminant(x3, y3, x1, y1, x2, y2) > 0
    );
  }
}

class TransformManager {
  init(globe) {
    this.globe = globe;
    window.ondragstart = () => false;
    window.addEventListener("mousedown", this.onMouseDown.bind(this));
    window.addEventListener("mousemove", this.onMouseMove.bind(this));
    window.addEventListener("mouseup", this.onMouseUp.bind(this));
    window.addEventListener("wheel", this.onWheel.bind(this));

    this.loop();
  }

  ease(progress) {
    const min = 0.2;
    return Tween.pow2easeOut(min + progress * (1 - min));
  }

  loop() {
    requestAnimationFrame(this.loop.bind(this));

    if (this.tween) {
      const current = this.tween.getCurrent();
      if (current.hasOwnProperty("lat") && current.hasOwnProperty("lon"))
        this.globe.rotate(current.lat, current.lon);
      if (current.hasOwnProperty("scale")) this.globe.scale(current.scale);
      if (this.tween.isEnded()) this.tween = null;
    } else if (this.spin && !this.drag) {
      const { lat, lon } = this.globe.transform;
      this.globe.rotate(lat, lon + 0.2);
    }

    this.globe.render();
  }

  onMouseDown(event) {
    const { lat, lon } = this.globe.transform;
    const layer = this.globe.currentLayer;
    const scene = layer.getSceneSnapshot();
    const touch = layer.getLatLon(event.pageX, event.pageY, scene);
    this.drag = { start: { lat, lon }, touch, scene };
    this.globe.lockLevel = true;
  }

  onMouseMove(event) {
    const drag = this.drag;
    if (!drag) return;

    const layer = this.globe.currentLayer;
    const scene = this.drag.scene;
    const touch = layer.getLatLon(event.pageX, event.pageY, scene);
    if (!touch) return;

    const { lat, lon } = this.globe.transform;
    const target = {
      lat: drag.start.lat + (drag.touch.lat - touch.lat),
      lon: drag.start.lon + (drag.touch.lon - touch.lon)
    };

    while (target.lon - lon > 180) target.lon -= 360;
    while (lon - target.lon > 180) target.lon += 360;

    this.tween = new Tween({ lat, lon }, target, 0.3, this.ease);
    this.tween.start();
  }

  onMouseUp(event) {
    this.drag = null;
    this.globe.lockLevel = false;
  }

  onWheel(event) {
    const delta = event.wheelDelta;
    const step = 1.4;
    const scale = this.globe.transform.scale;
    const target = scale * (delta > 1 ? step : 1 / step);
    this.tween = new Tween({ scale }, { scale: target }, 0.3, this.ease);
    this.tween.start();
  }
}

class Tween {
  constructor(source, target, duration, ease) {
    this.source = source;
    this.target = target;
    this.duration = duration;
    this.ease = ease || this.constructor.pow2easeOut;
  }

  start() {
    this.start = this.getCurrentTime();
    this.end = this.start + this.duration * 1000;
  }

  getCurrentTime() {
    return performance.now();
  }

  getProgress() {
    const result =
      (this.getCurrentTime() - this.start) / (this.end - this.start);
    return result > 1 ? 1 : result;
  }

  isEnded() {
    return this.getProgress() === 1;
  }

  getCurrent() {
    const progress = this.ease(this.getProgress());
    const result = {};
    for (const key in this.source)
      result[key] =
        this.source[key] + (this.target[key] - this.source[key]) * progress;
    return result;
  }

  static pow2easeOut(progress) {
    return 1 - Math.pow(1 - progress, 2);
  }
}

class XYMap {
  /** Javascript Numbers are 53 bits precise (Number.MAX_SAFE_INTEGER -> 9007199254740991). Use bitSpace <= 26 **/
  constructor(bitSpace) {
    this.map = new Map();
    this.power = Math.pow(2, bitSpace);
  }

  getKey(x, y) {
    return x * this.power + y;
  }

  add(x, y, item) {
    this.map.set(this.getKey(x, y), item);
    return item;
  }

  get(x, y) {
    return this.map.get(this.getKey(x, y));
  }

  has(x, y) {
    return this.map.has(this.getKey(x, y));
  }

  delete(x, y) {
    return this.map.delete(this.getKey(x, y));
  }

  clear() {
    return this.map.clear();
  }

  forEach(callback) {
    this.map.forEach(callback);
  }
}

SceneGenerator.BASE_EXPAND = 1;
SceneGenerator.BASE_PERSPECTIVE = 1000;

const container = document.querySelector(".container");
const transform = { lat: 25, lon: 0, scale: 1.5 };

const globe = new Globe();
globe.init(container, transform);

const manager = new TransformManager();
manager.init(globe);
manager.spin = true;
