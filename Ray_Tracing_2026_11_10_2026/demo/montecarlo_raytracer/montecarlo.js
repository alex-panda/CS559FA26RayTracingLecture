//@ts-check
/**
 * @file montecarlo.js
 * @description Monte Carlo Path Tracing Engine and Web Worker.
 * Computes physically-based global illumination via stochastic ray bouncing on diffuse surfaces (Lambertian),
 * microfacet rough metal scattering, refractive dielectric interfaces, procedural textures, planar primitives,
 * and participating media volumes based on Peter Shirley's "Ray Tracing in One Weekend" and "Ray Tracing: The Next Week".
 * 
 * Runs inside a dedicated Web Worker or directly in a script context.
 */

// ----------------------------------------------------------------------------
// Type Definitions (JSDoc)
// ----------------------------------------------------------------------------

/**
 * @typedef {Object} XYZLike
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [z]
 */

/**
 * @typedef {Object} RGBLike
 * @property {number} [r]
 * @property {number} [g]
 * @property {number} [b]
 */

/**
 * @typedef {[number, number, number] | XYZLike | RGBLike | Vec3} Vec3Like
 * A 3D vector-like representation: array [x,y,z], object {x,y,z}, object {r,g,b}, or Vec3 instance.
 */

/**
 * @typedef {Vec3Like} Point3DLike
 * A 3D point-like representation in world coordinates.
 */

/**
 * @typedef {Vec3Like} ColorLike
 * An RGB color representation (normalized 0.0 to 1.0).
 */

/**
 * @typedef {Vec3} Point3D
 */

/**
 * @typedef {Vec3} Color
 */

/**
 * @typedef {Object} CameraSpec
 * @property {Point3DLike} [lookfrom] Camera origin point in 3D world space.
 * @property {Point3DLike} [lookat] Target point the camera aims toward.
 * @property {Vec3Like} [vup] Up vector defining camera vertical orientation.
 * @property {number} [vfov] Vertical field of view in degrees.
 * @property {number} [aspectRatio] Viewport aspect ratio (imageWidth / imageHeight).
 * @property {number} [aperture] Lens aperture diameter for depth of field (0.0 = sharp pinhole).
 * @property {number} [focusDist] Distance from camera origin to plane of perfect focus.
 * @property {number} [focalLength] Pinhole focal distance along -Z.
 * @property {number} [time0] Shutter opening time for motion blur.
 * @property {number} [time1] Shutter closing time for motion blur.
 */

/**
 * @typedef {Object} LambertianSpec
 * @property {'Lambertian'} kind
 * @property {ColorLike | Texture} [albedo]
 * @property {ColorLike | Texture} [color]
 * @property {'lambertian'|'rejection'|'hemisphere'} [diffuseMethod]
 */

/**
 * @typedef {Object} MetalSpec
 * @property {'Metal'} kind
 * @property {ColorLike} [albedo]
 * @property {ColorLike} [color]
 * @property {number} [fuzz]
 */

/**
 * @typedef {Object} DielectricSpec
 * @property {'Dielectric'} kind
 * @property {number} [indexOfRefraction]
 * @property {number} [refractiveIndex]
 * @property {number} [ir]
 */

/**
 * @typedef {Object} NormalMaterialSpec
 * @property {'NormalMaterial'} kind
 */

/**
 * @typedef {Object} DiffuseLightSpec
 * @property {'DiffuseLight'} kind
 * @property {ColorLike | Texture} [emit]
 * @property {ColorLike | Texture} [color]
 */

/**
 * @typedef {Object} IsotropicSpec
 * @property {'Isotropic'} kind
 * @property {ColorLike | Texture} [albedo]
 * @property {ColorLike | Texture} [color]
 */

/**
 * @typedef {LambertianSpec | MetalSpec | DielectricSpec | NormalMaterialSpec | DiffuseLightSpec | IsotropicSpec | Material} MaterialSpec
 */

/**
 * @typedef {Object} SphereSpec
 * @property {'Sphere'} kind
 * @property {Point3DLike} center
 * @property {number} radius
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {Object} MovingSphereSpec
 * @property {'MovingSphere'} kind
 * @property {Point3DLike} center0
 * @property {Point3DLike} center1
 * @property {number} time0
 * @property {number} time1
 * @property {number} radius
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {Object} XYRectSpec
 * @property {'XYRect'} kind
 * @property {number} x0
 * @property {number} x1
 * @property {number} y0
 * @property {number} y1
 * @property {number} k
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {Object} XZRectSpec
 * @property {'XZRect'} kind
 * @property {number} x0
 * @property {number} x1
 * @property {number} z0
 * @property {number} z1
 * @property {number} k
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {Object} YZRectSpec
 * @property {'YZRect'} kind
 * @property {number} y0
 * @property {number} y1
 * @property {number} z0
 * @property {number} z1
 * @property {number} k
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {Object} AABoxSpec
 * @property {'AABox'} kind
 * @property {Point3DLike} p0
 * @property {Point3DLike} p1
 * @property {Material | MaterialSpec} material
 */

/**
 * @typedef {SphereSpec | MovingSphereSpec | XYRectSpec | XZRectSpec | YZRectSpec | AABoxSpec | Hittable} HittableSpec
 */

/**
 * @typedef {'random-points' | 'outside-in' | 'random' | 'left-up-row' | 'right-up-row' | 'left-down-row' | 'right-down-row' | 'left-up-col' | 'right-up-col' | 'left-down-col' | 'right-down-col'} RenderPatternName
 */

/**
 * @typedef {Object} RenderPatternSpec
 * @property {RenderPatternName} [pattern] Progressive scan pattern to apply.
 * @property {number} [numRows] Number of vertical partition tiles.
 * @property {number} [numCols] Number of horizontal partition tiles.
 */

/**
 * @typedef {[number, number, [number, number, number]]} RenderedPixel
 */

/**
 * @typedef {[[number, number], RenderedPixel[], boolean, {rayBounces?: number, raysTraced?: number}?]} ProgressPayload
 */

/**
 * @typedef {Object} RaytracerOptions
 * @property {number} [imageWidth] Width of rendered canvas in pixels.
 * @property {number} [imageHeight] Height of rendered canvas in pixels.
 * @property {number} [aspectRatio] Canvas aspect ratio.
 * @property {number} [samplesPerPixel] Number of antialiasing ray samples per pixel.
 * @property {number} [maxDepth] Maximum number of ray bounces.
 * @property {boolean} [aaJitter=true] Whether to apply subpixel anti-aliasing jitter to ray samples.
 * @property {'shaded'|'normals'} [mode] Shading mode: full ray tracing or surface normal visualization.
 * @property {number} [gamma] Gamma exponent for color correction.
 * @property {'sky'|'black'|'white'|string|ColorLike} [background] Background appearance ('sky', 'black', 'white', or RGB ColorLike).
 * @property {number} [hitMin] Minimum ray hit parameter to prevent self-intersection shadow acne.
 * @property {'lambertian'|'rejection'|'hemisphere'} [diffuseMethod] Diffuse scattering model.
 * @property {CameraSpec} [camera] Camera orientation and optics configuration.
 * @property {string | HittableSpec[]} [scene] Scene preset name or array of hittable objects.
 * @property {RenderPatternSpec | null} [renderPattern] Progressive rendering pattern configuration.
 * @property {boolean} [aabb] When true, constructs a BVH acceleration hierarchy over all scene objects.
 * @property {number} [updateInterval] How many pixel batches between UI progress messages.
 * @property {number} [vfov] Vertical field of view in degrees.
 * @property {number} [aperture] Lens aperture diameter.
 * @property {number} [focusDist] Distance to plane of perfect focus.
 * @property {number} [time0] Shutter opening time.
 * @property {number} [time1] Shutter closing time.
 */

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const INFINITY = Infinity;
export const PI = 3.1415926535897932385;

// ----------------------------------------------------------------------------
// Math and Vector Classes
// ----------------------------------------------------------------------------

/**
 * 3D Vector class with comprehensive vector arithmetic and RGB color conveniences.
 */
export class Vec3 {
    /**
     * Constructs a 3D vector.
     * @param {number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     */
    constructor(x = 0, y = 0, z = 0) {
        /**
         * X-coordinate in 3D Cartesian space, or Red color channel value (0.0 to 1.0).
         * @type {number}
         */
        this.x = Number(x) || 0;
        /**
         * Y-coordinate in 3D Cartesian space, or Green color channel value (0.0 to 1.0).
         * @type {number}
         */
        this.y = Number(y) || 0;
        /**
         * Z-coordinate in 3D Cartesian space, or Blue color channel value (0.0 to 1.0).
         * @type {number}
         */
        this.z = Number(z) || 0;
    }

    /** @returns {number} */
    get r() { return this.x; }
    /** @param {number} newR */
    set r(newR) { this.x = newR; }

    /** @returns {number} */
    get g() { return this.y; }
    /** @param {number} newG */
    set g(newG) { this.y = newG; }

    /** @returns {number} */
    get b() { return this.z; }
    /** @param {number} newB */
    set b(newB) { this.z = newB; }

    /**
     * Converts a vector-like argument into a Vec3 instance.
     * @param {Vec3Like} [v]
     * @param {number} [defaultVal=0]
     * @returns {Vec3}
     */
    static from(v, defaultVal = 0) {
        if (!v && v !== 0) return new Vec3(defaultVal, defaultVal, defaultVal);
        if (v instanceof Vec3) return v.copy();
        if (typeof v === 'number') return new Vec3(v, v, v);
        if (Array.isArray(v)) return new Vec3(v[0] ?? defaultVal, v[1] ?? defaultVal, v[2] ?? defaultVal);
        if (typeof v === 'object') {
            if ('x' in v || 'y' in v || 'z' in v) {
                return new Vec3(v.x ?? defaultVal, v.y ?? defaultVal, v.z ?? defaultVal);
            }
            if ('r' in v || 'g' in v || 'b' in v) {
                return new Vec3(v.r ?? defaultVal, v.g ?? defaultVal, v.b ?? defaultVal);
            }
        }
        return new Vec3(defaultVal, defaultVal, defaultVal);
    }

    /**
     * Creates a vector with random components in [min, max).
     * @param {number} [min=0.0]
     * @param {number} [max=1.0]
     * @returns {Vec3}
     */
    static random(min = 0.0, max = 1.0) {
        return new Vec3(randomDouble(min, max), randomDouble(min, max), randomDouble(min, max));
    }

    /**
     * Instance version of random vector generator.
     * @param {number} [min=0.0]
     * @param {number} [max=1.0]
     * @returns {Vec3}
     */
    random(min = 0.0, max = 1.0) {
        return Vec3.random(min, max);
    }

    /**
     * Returns true if all components are very close to zero.
     * @returns {boolean}
     */
    nearZero() {
        const s = 1e-8;
        return (Math.abs(this.x) < s) && (Math.abs(this.y) < s) && (Math.abs(this.z) < s);
    }

    /** @returns {Vec3} A cloned copy of this vector. */
    copy() {
        return new Vec3(this.x, this.y, this.z);
    }

    /** @returns {Vec3} The negated vector (-x, -y, -z). */
    negative() {
        return new Vec3(-this.x, -this.y, -this.z);
    }

    /**
     * In-place subtraction.
     * @param {Vec3} vec3
     * @returns {Vec3} this
     */
    minusEq(vec3) {
        this.x -= vec3.x;
        this.y -= vec3.y;
        this.z -= vec3.z;
        return this;
    }

    /**
     * In-place addition.
     * @param {Vec3} vec3
     * @returns {Vec3} this
     */
    plusEq(vec3) {
        this.x += vec3.x;
        this.y += vec3.y;
        this.z += vec3.z;
        return this;
    }

    /**
     * In-place component-wise multiplication.
     * @param {Vec3} vec3
     * @returns {Vec3} this
     */
    timesEq(vec3) {
        this.x *= vec3.x;
        this.y *= vec3.y;
        this.z *= vec3.z;
        return this;
    }

    /**
     * In-place component-wise division.
     * @param {Vec3} vec3
     * @returns {Vec3} this
     */
    divEq(vec3) {
        this.x /= vec3.x;
        this.y /= vec3.y;
        this.z /= vec3.z;
        return this;
    }

    /** @returns {number} Vector Euclidean length. */
    length() {
        return Math.sqrt(this.lengthSquared());
    }

    /** @returns {number} Squared length. */
    lengthSquared() {
        return (this.x * this.x) + (this.y * this.y) + (this.z * this.z);
    }

    /** @returns {string} */
    toString() {
        return `<Vec3(${this.x}, ${this.y}, ${this.z})>`;
    }

    /** @returns {string} CSS rgb color string representation. */
    toColorString() {
        return `rgb(${Math.floor(255.99 * clamp(this.r, 0, 1))}, ${Math.floor(255.99 * clamp(this.g, 0, 1))}, ${Math.floor(255.99 * clamp(this.b, 0, 1))})`;
    }

    /**
     * Component-wise addition.
     * @param {Vec3} vec3
     * @returns {Vec3}
     */
    plus(vec3) {
        return new Vec3(this.x + vec3.x, this.y + vec3.y, this.z + vec3.z);
    }

    /**
     * Scalar addition.
     * @param {number} num
     * @returns {Vec3}
     */
    plusNum(num) {
        return new Vec3(this.x + num, this.y + num, this.z + num);
    }

    /**
     * Component-wise subtraction.
     * @param {Vec3} vec3
     * @returns {Vec3}
     */
    minus(vec3) {
        return new Vec3(this.x - vec3.x, this.y - vec3.y, this.z - vec3.z);
    }

    /**
     * Scalar subtraction: this - num.
     * @param {number} num
     * @returns {Vec3}
     */
    minusNum(num) {
        return new Vec3(this.x - num, this.y - num, this.z - num);
    }

    /**
     * Scalar reverse subtraction: num - this.
     * @param {number} num
     * @returns {Vec3}
     */
    minusedByNum(num) {
        return new Vec3(num - this.x, num - this.y, num - this.z);
    }

    /**
     * Component-wise multiplication.
     * @param {Vec3} vec3
     * @returns {Vec3}
     */
    times(vec3) {
        return new Vec3(this.x * vec3.x, this.y * vec3.y, this.z * vec3.z);
    }

    /**
     * Scalar multiplication.
     * @param {number} num
     * @returns {Vec3}
     */
    timesNum(num) {
        return new Vec3(this.x * num, this.y * num, this.z * num);
    }

    /**
     * Component-wise division.
     * @param {Vec3} vec3
     * @returns {Vec3}
     */
    divBy(vec3) {
        return new Vec3(this.x / vec3.x, this.y / vec3.y, this.z / vec3.z);
    }

    /**
     * Scalar division.
     * @param {number} num
     * @returns {Vec3}
     */
    divByNum(num) {
        return new Vec3(this.x / num, this.y / num, this.z / num);
    }

    /**
     * Dot product.
     * @param {Vec3} vec3
     * @returns {number}
     */
    dot(vec3) {
        return (this.x * vec3.x) + (this.y * vec3.y) + (this.z * vec3.z);
    }

    /**
     * Vector cross product.
     * @param {Vec3} vec3
     * @returns {Vec3}
     */
    cross(vec3) {
        return new Vec3(
            this.y * vec3.z - this.z * vec3.y,
            this.z * vec3.x - this.x * vec3.z,
            this.x * vec3.y - this.y * vec3.x
        );
    }

    /**
     * Normalizes this vector to unit length.
     * @returns {Vec3}
     */
    unitVector() {
        const len = this.length();
        return len > 0 ? this.divByNum(len) : new Vec3(0, 0, 0);
    }
}

// Aliases for 3D points and RGB colors
export const Point3D = Vec3;
export const Color = Vec3;

export const WHITE = new Color(1.0, 1.0, 1.0);
export const BLACK = new Color(0.0, 0.0, 0.0);

/**
 * Parses a color specification into a Color.
 * @param {any} v
 * @param {Color} [defaultColor=BLACK]
 * @returns {Color}
 */
export function parseColor(v, defaultColor = BLACK) {
    if (v === null || v === undefined || v === '') return defaultColor.copy();
    if (v instanceof Vec3) return v.copy();
    if (typeof v === 'number') {
        const val = v > 1 ? v / 255 : v;
        return new Color(val, val, val);
    }
    if (Array.isArray(v)) {
        const c0 = Number(v[0]) || 0;
        const c1 = Number(v[1]) || 0;
        const c2 = Number(v[2]) || 0;
        // Only scale down if values exceed 255 (or if standard 0-255 byte integers were explicitly intended)
        const scale = (c0 > 255 || c1 > 255 || c2 > 255) ? (1 / 255) : 1;
        return new Color(c0 * scale, c1 * scale, c2 * scale);
    }
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'black' || s === 'none' || s === 'dark' || s === '0' || s === 'off') return new Color(0, 0, 0);
        if (s === 'white' || s === '1') return new Color(1, 1, 1);
        if (s === 'red') return new Color(0.85, 0.15, 0.15);
        if (s === 'green') return new Color(0.15, 0.85, 0.15);
        if (s === 'blue') return new Color(0.15, 0.35, 0.9);
        if (s === 'gray' || s === 'grey') return new Color(0.5, 0.5, 0.5);
        if (s === 'yellow') return new Color(0.85, 0.85, 0.15);
        if (s === 'cyan') return new Color(0.15, 0.85, 0.85);
        if (s === 'magenta') return new Color(0.85, 0.15, 0.85);

        if (s.startsWith('#') || /^[0-9a-f]{6}$/i.test(s)) {
            const hex = s.startsWith('#') ? s.slice(1) : s;
            const r = parseInt(hex.slice(0, 2), 16) / 255.0;
            const g = parseInt(hex.slice(2, 4), 16) / 255.0;
            const b = parseInt(hex.slice(4, 6), 16) / 255.0;
            return new Color(r, g, b);
        }

        if (s.includes(',')) {
            const parts = s.split(',').map(p => Number(p.trim()));
            if (parts.length >= 3 && !parts.some(isNaN)) {
                const scale = (parts[0] > 1 || parts[1] > 1 || parts[2] > 1) ? (1 / 255) : 1;
                return new Color(parts[0] * scale, parts[1] * scale, parts[2] * scale);
            }
        }
        const num = Number(s);
        if (!isNaN(num)) {
            const val = num > 1 ? num / 255 : num;
            return new Color(val, val, val);
        }
    }
    return Color.from(v, 0);
}

// ----------------------------------------------------------------------------
// Ray & Intersection Record
// ----------------------------------------------------------------------------

/**
 * Class representing a ray of light with an origin point and direction vector.
 */
export class Ray {
    /**
     * @param {Point3DLike} [origin]
     * @param {Vec3Like} [direction]
     * @param {number} [time=0.0] Shutter time sample for motion blur.
     */
    constructor(origin, direction, time = 0.0) {
        /** @type {Point3D} */
        this.origin = Point3D.from(origin);
        /** @type {Vec3} */
        this.direction = Vec3.from(direction);
        /** @type {number} */
        this.time = Number(time) || 0.0;
    }

    /**
     * Evaluates ray position at parameter t: P(t) = origin + t * direction.
     * @param {number} t
     * @returns {Point3D}
     */
    at(t) {
        return this.origin.plus(this.direction.timesNum(t));
    }

    /** @returns {string} */
    toString() {
        return `<Ray(origin=${this.origin}, direction=${this.direction}, time=${this.time})>`;
    }
}

/**
 * Stores details of a ray-surface intersection.
 */
export class HitRecord {
    constructor() {
        /** @type {Point3D | null} */
        this.p = null;
        /** @type {Vec3 | null} */
        this.normal = null;
        /** @type {Material | null} */
        this.material = null;
        /** @type {number} */
        this.t = 0;
        /** @type {number} */
        this.u = 0;
        /** @type {number} */
        this.v = 0;
        /** @type {boolean} */
        this.frontFace = true;
    }

    /**
     * Determines whether normal points inward or outward relative to incident ray.
     * @param {Ray} ray
     * @param {Vec3} outwardNormal
     */
    setFaceNormal(ray, outwardNormal) {
        this.frontFace = ray.direction.dot(outwardNormal) < 0;
        this.normal = this.frontFace ? outwardNormal : outwardNormal.negative();
    }

    /**
     * Copies values from another HitRecord.
     * @param {HitRecord} hitRecord
     */
    become(hitRecord) {
        this.p = hitRecord.p ? hitRecord.p.copy() : null;
        this.normal = hitRecord.normal ? hitRecord.normal.copy() : null;
        this.material = hitRecord.material;
        this.t = hitRecord.t;
        this.u = hitRecord.u;
        this.v = hitRecord.v;
        this.frontFace = hitRecord.frontFace;
    }

    /** @returns {string} */
    toString() {
        return `<HitRecord(p=${this.p}, normal=${this.normal}, material=${this.material}, t=${this.t}, u=${this.u}, v=${this.v}, frontFace=${this.frontFace})>`;
    }
}

// ----------------------------------------------------------------------------
// Hittables / Geometry
// ----------------------------------------------------------------------------

/**
 * Base class for objects that can be intersected by rays.
 */
export class Hittable {
    constructor() {
        /** @type {string} */
        this.kind = 'Hittable';
        /** @type {Material | null} */
        this.material = null;
    }

    /**
     * Tests ray intersection within distance bounds [tMin, tMax].
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord Output record populated on hit.
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        throw new Error('hitBy is not implemented for this Hittable object.');
    }

    /**
     * Computes the axis-aligned bounding box enclosing this object.
     * @returns {AABB|null}
     */
    boundingBox() {
        return null;
    }

    /** @returns {string} */
    toString() {
        return `<Hittable()>`;
    }
}

/**
 * Axis-Aligned Bounding Box (AABB) for spatial acceleration hierarchies.
 */
export class AABB {
    /**
     * @param {Point3D} minimum
     * @param {Point3D} maximum
     */
    constructor(minimum, maximum) {
        /** @type {Point3D} */
        this.minimum = minimum;
        /** @type {Point3D} */
        this.maximum = maximum;
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @returns {boolean}
     */
    hit(ray, tMin, tMax) {
        const axes = /** @type {const} */ (['x', 'y', 'z']);
        for (const axis of axes) {
            const invD = 1.0 / ray.direction[axis];
            let t0 = (this.minimum[axis] - ray.origin[axis]) * invD;
            let t1 = (this.maximum[axis] - ray.origin[axis]) * invD;
            if (invD < 0.0) {
                const temp = t0;
                t0 = t1;
                t1 = temp;
            }
            tMin = t0 > tMin ? t0 : tMin;
            tMax = t1 < tMax ? t1 : tMax;
            if (tMax <= tMin) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param {AABB} box0
     * @param {AABB} box1
     * @returns {AABB}
     */
    static surroundingBox(box0, box1) {
        if (!box0) return box1;
        if (!box1) return box0;
        const small = new Point3D(
            Math.min(box0.minimum.x, box1.minimum.x),
            Math.min(box0.minimum.y, box1.minimum.y),
            Math.min(box0.minimum.z, box1.minimum.z)
        );
        const big = new Point3D(
            Math.max(box0.maximum.x, box1.maximum.x),
            Math.max(box0.maximum.y, box1.maximum.y),
            Math.max(box0.maximum.z, box1.maximum.z)
        );
        return new AABB(small, big);
    }

    /** @returns {string} */
    toString() {
        return `<AABB(min=${this.minimum}, max=${this.maximum})>`;
    }
}

/**
 * Computes spherical UV coordinates (u, v) on a unit sphere given surface normal.
 * @param {Vec3} p Normalized point on unit sphere.
 * @returns {[number, number]}
 */
export function getSphereUV(p) {
    const theta = Math.acos(clamp(-p.y, -1.0, 1.0));
    const phi = Math.atan2(-p.z, p.x) + PI;
    return [phi / (2 * PI), theta / PI];
}

/**
 * 3D Sphere geometry.
 */
export class Sphere extends Hittable {
    /**
     * @param {Point3DLike} center
     * @param {number} radius
     * @param {Material | MaterialSpec} material
     */
    constructor(center, radius, material) {
        super();
        this.kind = 'Sphere';
        this.center = Point3D.from(center);
        this.radius = Number(radius);
        this.material = createMaterial(material);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const oc = ray.origin.minus(this.center);
        const a = ray.direction.lengthSquared();
        const halfB = oc.dot(ray.direction);
        const c = oc.lengthSquared() - (this.radius * this.radius);

        const discriminant = (halfB * halfB) - (a * c);
        if (discriminant < 0) return false;
        const sqrtD = Math.sqrt(discriminant);

        let root = (-halfB - sqrtD) / a;
        if (root < tMin || tMax < root) {
            root = (-halfB + sqrtD) / a;
            if (root < tMin || tMax < root) {
                return false;
            }
        }

        hitRecord.t = root;
        hitRecord.p = ray.at(hitRecord.t);
        const outwardNormal = hitRecord.p.minus(this.center).divByNum(this.radius);
        hitRecord.setFaceNormal(ray, outwardNormal);
        const [u, v] = getSphereUV(outwardNormal);
        hitRecord.u = u;
        hitRecord.v = v;
        hitRecord.material = this.material;

        return true;
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        const rad = Math.abs(this.radius);
        return new AABB(
            new Point3D(this.center.x - rad, this.center.y - rad, this.center.z - rad),
            new Point3D(this.center.x + rad, this.center.y + rad, this.center.z + rad)
        );
    }

    /**
     * @returns {Point3D}
     */
    randomPoint() {
        return this.center.plus(randomUnitVector().timesNum(this.radius));
    }

    /** @returns {string} */
    toString() {
        return `<Sphere(center=${this.center}, radius=${this.radius}, material=${this.material})>`;
    }
}

/**
 * Linearly moving sphere for motion blur simulation.
 */
export class MovingSphere extends Hittable {
    /**
     * @param {Point3DLike} center0
     * @param {Point3DLike} center1
     * @param {number} time0
     * @param {number} time1
     * @param {number} radius
     * @param {Material | MaterialSpec} material
     */
    constructor(center0, center1, time0, time1, radius, material) {
        super();
        this.kind = 'MovingSphere';
        this.center0 = Point3D.from(center0);
        this.center1 = Point3D.from(center1);
        this.time0 = typeof time0 === 'number' ? time0 : (time0 !== undefined ? Number(time0) : 0.0);
        this.time1 = typeof time1 === 'number' ? time1 : (time1 !== undefined ? Number(time1) : 1.0);
        this.radius = Number(radius);
        this.material = createMaterial(material);
    }

    /**
     * @param {number} time
     * @returns {Point3D}
     */
    center(time) {
        const dt = this.time1 - this.time0;
        const s = Math.abs(dt) > 1e-8 ? (time - this.time0) / dt : 0;
        return this.center0.plus(this.center1.minus(this.center0).timesNum(s));
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const curCenter = this.center(ray.time);
        const oc = ray.origin.minus(curCenter);
        const a = ray.direction.lengthSquared();
        const halfB = oc.dot(ray.direction);
        const c = oc.lengthSquared() - (this.radius * this.radius);

        const discriminant = (halfB * halfB) - (a * c);
        if (discriminant < 0) return false;
        const sqrtD = Math.sqrt(discriminant);

        let root = (-halfB - sqrtD) / a;
        if (root < tMin || tMax < root) {
            root = (-halfB + sqrtD) / a;
            if (root < tMin || tMax < root) {
                return false;
            }
        }

        hitRecord.t = root;
        hitRecord.p = ray.at(hitRecord.t);
        const outwardNormal = hitRecord.p.minus(curCenter).divByNum(this.radius);
        hitRecord.setFaceNormal(ray, outwardNormal);
        const [u, v] = getSphereUV(outwardNormal);
        hitRecord.u = u;
        hitRecord.v = v;
        hitRecord.material = this.material;

        return true;
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        const rad = Math.abs(this.radius);
        const box0 = new AABB(
            new Point3D(this.center0.x - rad, this.center0.y - rad, this.center0.z - rad),
            new Point3D(this.center0.x + rad, this.center0.y + rad, this.center0.z + rad)
        );
        const box1 = new AABB(
            new Point3D(this.center1.x - rad, this.center1.y - rad, this.center1.z - rad),
            new Point3D(this.center1.x + rad, this.center1.y + rad, this.center1.z + rad)
        );
        return AABB.surroundingBox(box0, box1);
    }

    /** @returns {string} */
    toString() {
        return `<MovingSphere(c0=${this.center0}, c1=${this.center1}, radius=${this.radius})>`;
    }
}

/**
 * AABB / BVH Tree Node for hierarchical spatial partitioning.
 */
export class AABBNode extends Hittable {
    /**
     * @param {Hittable[]} srcObjects Array of hittable objects.
     * @param {number} [start=0] Start index.
     * @param {number} [end] End index (exclusive).
     */
    constructor(srcObjects, start = 0, end = srcObjects.length) {
        super();
        this.kind = 'AABBNode';
        const objects = [...srcObjects];
        /** @type {Hittable} */
        this.left = objects[start];
        /** @type {Hittable | null} */
        this.right = null;
        /** @type {AABB | null} */
        this.box = null;

        let bounds = null;
        for (let i = start; i < end; i++) {
            const b = objects[i].boundingBox();
            if (b) bounds = bounds ? AABB.surroundingBox(bounds, b) : b;
        }

        let axis = 0;
        if (bounds) {
            const dx = bounds.maximum.x - bounds.minimum.x;
            const dy = bounds.maximum.y - bounds.minimum.y;
            const dz = bounds.maximum.z - bounds.minimum.z;
            if (dy >= dx && dy >= dz) axis = 1;
            else if (dz >= dx && dz >= dy) axis = 2;
            else axis = 0;
        } else {
            axis = randomInt(0, 2);
        }

        const axisKey = /** @type {'x' | 'y' | 'z'} */ (axis === 0 ? 'x' : axis === 1 ? 'y' : 'z');
        /**
         * @param {Hittable} a
         * @param {Hittable} b
         * @returns {number}
         */
        const comparator = (a, b) => {
            const boxA = a.boundingBox();
            const boxB = b.boundingBox();
            if (!boxA || !boxB) return 0;
            return boxA.minimum[axisKey] - boxB.minimum[axisKey];
        };

        const objectSpan = end - start;
        if (objectSpan <= 0) {
            this.left = /** @type {any} */ (null);
            this.right = null;
            this.box = null;
            return;
        }
        if (objectSpan === 1) {
            this.left = objects[start];
            this.right = null;
            this.box = this.left.boundingBox();
        } else if (objectSpan === 2) {
            if (comparator(objects[start], objects[start + 1]) <= 0) {
                this.left = objects[start];
                this.right = objects[start + 1];
            } else {
                this.left = objects[start + 1];
                this.right = objects[start];
            }
            const boxLeft = this.left.boundingBox();
            const boxRight = this.right.boundingBox();
            this.box = (boxLeft && boxRight) ? AABB.surroundingBox(boxLeft, boxRight) : (boxLeft || boxRight);
        } else {
            const slice = objects.slice(start, end).sort(comparator);
            for (let i = 0; i < slice.length; i++) {
                objects[start + i] = slice[i];
            }
            const mid = start + Math.floor(objectSpan / 2);
            this.left = new AABBNode(objects, start, mid);
            this.right = new AABBNode(objects, mid, end);
            const boxLeft = this.left.boundingBox();
            const boxRight = this.right.boundingBox();
            this.box = (boxLeft && boxRight) ? AABB.surroundingBox(boxLeft, boxRight) : (boxLeft || boxRight);
        }
    }

    /** @returns {AABB | null} */
    boundingBox() {
        return this.box;
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        if (!this.box || !this.box.hit(ray, tMin, tMax)) {
            return false;
        }
        const hitLeft = this.left ? this.left.hitBy(ray, tMin, tMax, hitRecord) : false;
        const hitRight = this.right ? this.right.hitBy(ray, tMin, hitLeft ? hitRecord.t : tMax, hitRecord) : false;
        return hitLeft || hitRight;
    }

    /** @returns {string} */
    toString() {
        return `<AABBNode(box=${this.box})>`;
    }
}

/**
 * Collection of hittable objects representing a scene.
 */
export class HittableList extends Hittable {
    /**
     * @param {Hittable[]} [hittables=[]]
     */
    constructor(hittables = []) {
        super();
        this.kind = 'HittableList';
        /** @type {Hittable[]} */
        this.hittables = [...hittables];
    }

    /**
     * @param {Hittable} hittable
     */
    add(hittable) {
        this.hittables.push(hittable);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const tempHitRecord = new HitRecord();
        let hitAnything = false;
        let closestSoFar = tMax;

        for (const hittable of this.hittables) {
            if (hittable.hitBy(ray, tMin, closestSoFar, tempHitRecord)) {
                hitAnything = true;
                closestSoFar = tempHitRecord.t;
                hitRecord.become(tempHitRecord);
            }
        }

        return hitAnything;
    }

    /**
     * @returns {AABB | null}
     */
    boundingBox() {
        if (this.hittables.length === 0) return null;
        /** @type {AABB | null} */
        let outputBox = null;
        for (const object of this.hittables) {
            const tempBox = object.boundingBox();
            if (!tempBox) return null;
            outputBox = outputBox ? AABB.surroundingBox(outputBox, tempBox) : tempBox;
        }
        return outputBox;
    }

    /**
     * @returns {HittableList}
     */
    buildAABBTree() {
        if (this.hittables.length <= 1) {
            return this;
        }
        const root = new AABBNode(this.hittables, 0, this.hittables.length);
        const list = new HittableList();
        list.add(root);
        return list;
    }

    /** @returns {string} */
    toString() {
        return `<HittableList(hittables=[${this.hittables}])>`;
    }
}

// ----------------------------------------------------------------------------
// Textures
// ----------------------------------------------------------------------------

/**
 * Base Texture class for procedural or image-based surface colors.
 */
export class Texture {
    /**
     * @param {number} u
     * @param {number} v
     * @param {Point3D} p
     * @returns {Color}
     */
    value(u, v, p) {
        return new Color(0, 0, 0);
    }
}

/**
 * Constant solid color texture.
 */
export class SolidColor extends Texture {
    /**
     * @param {ColorLike | number} colorOrR
     * @param {number} [g]
     * @param {number} [b]
     */
    constructor(colorOrR, g, b) {
        super();
        if (typeof colorOrR === 'number' && typeof g === 'number' && typeof b === 'number') {
            this.colorValue = new Color(colorOrR, g, b);
        } else {
            this.colorValue = parseColor(colorOrR, WHITE);
        }
    }

    /**
     * @param {number} u
     * @param {number} v
     * @param {Point3D} p
     * @returns {Color}
     */
    value(u, v, p) {
        return this.colorValue.copy();
    }
}

/**
 * 3D checkerboard texture alternating between two colors or sub-textures.
 */
export class CheckerTexture extends Texture {
    /**
     * @param {number | ColorLike | Texture} scaleOrC1
     * @param {ColorLike | Texture} c1OrC2
     * @param {ColorLike | Texture} [c2]
     */
    constructor(scaleOrC1, c1OrC2, c2) {
        super();
        let scale = 10.0;
        let even;
        let odd;
        if (c2 !== undefined) {
            scale = Number(scaleOrC1) || 10.0;
            even = c1OrC2;
            odd = c2;
        } else {
            even = scaleOrC1;
            odd = c1OrC2;
        }
        this.scale = scale;
        this.even = even instanceof Texture ? even : new SolidColor(even);
        this.odd = odd instanceof Texture ? odd : new SolidColor(odd);
    }

    /**
     * @param {number} u
     * @param {number} v
     * @param {Point3D} p
     * @returns {Color}
     */
    value(u, v, p) {
        const sines = Math.sin(this.scale * p.x) * Math.sin(this.scale * p.y) * Math.sin(this.scale * p.z);
        return sines < 0 ? this.odd.value(u, v, p) : this.even.value(u, v, p);
    }
}

/**
 * 3D Perlin noise generator with permutation tables and trilinear Hermite cubic smoothing.
 */
export class Perlin {
    constructor() {
        this.pointCount = 256;
        /** @type {Vec3[]} */
        this.ranVec = [];
        for (let i = 0; i < this.pointCount; ++i) {
            this.ranVec.push(randomUnitVector());
        }
        this.permX = Perlin.perlinGeneratePerm(this.pointCount);
        this.permY = Perlin.perlinGeneratePerm(this.pointCount);
        this.permZ = Perlin.perlinGeneratePerm(this.pointCount);
    }

    /**
     * @param {number} n
     * @returns {number[]}
     */
    static perlinGeneratePerm(n) {
        /** @type {number[]} */
        const p = [];
        for (let i = 0; i < n; i++) p[i] = i;
        for (let i = n - 1; i > 0; i--) {
            const target = randomInt(0, i);
            const tmp = p[i];
            p[i] = p[target];
            p[target] = tmp;
        }
        return p;
    }

    /**
     * @param {Point3D} p
     * @returns {number}
     */
    noise(p) {
        const u = p.x - Math.floor(p.x);
        const v = p.y - Math.floor(p.y);
        const w = p.z - Math.floor(p.z);

        const i = Math.floor(p.x);
        const j = Math.floor(p.y);
        const k = Math.floor(p.z);

        /** @type {Vec3[][][]} */
        const c = [];
        for (let di = 0; di < 2; di++) {
            c[di] = [];
            for (let dj = 0; dj < 2; dj++) {
                c[di][dj] = [];
                for (let dk = 0; dk < 2; dk++) {
                    const idx = this.permX[(i + di) & 255] ^ this.permY[(j + dj) & 255] ^ this.permZ[(k + dk) & 255];
                    c[di][dj][dk] = this.ranVec[idx];
                }
            }
        }
        return Perlin.perlinInterp(c, u, v, w);
    }

    /**
     * @param {Vec3[][][]} c
     * @param {number} u
     * @param {number} v
     * @param {number} w
     * @returns {number}
     */
    static perlinInterp(c, u, v, w) {
        const uu = u * u * (3 - 2 * u);
        const vv = v * v * (3 - 2 * v);
        const ww = w * w * (3 - 2 * w);
        let accum = 0.0;

        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                for (let k = 0; k < 2; k++) {
                    const weightV = new Vec3(u - i, v - j, w - k);
                    accum += (i * uu + (1 - i) * (1 - uu)) *
                             (j * vv + (1 - j) * (1 - vv)) *
                             (k * ww + (1 - k) * (1 - ww)) *
                             c[i][j][k].dot(weightV);
                }
            }
        }
        return accum;
    }

    /**
     * @param {Point3D} p
     * @param {number} [depth=7]
     * @returns {number}
     */
    turb(p, depth = 7) {
        let accum = 0.0;
        let tempP = p.copy();
        let weight = 1.0;
        for (let i = 0; i < depth; i++) {
            accum += weight * this.noise(tempP);
            weight *= 0.5;
            tempP = tempP.timesNum(2.0);
        }
        return Math.abs(accum);
    }
}

/**
 * Procedural marble or organic noise texture using Perlin turbulence.
 */
export class NoiseTexture extends Texture {
    /**
     * @param {number} [scale=1.0]
     * @param {'marble'|'turb'|'noise'} [type='marble']
     */
    constructor(scale = 1.0, type = 'marble') {
        super();
        this.scale = Number(scale) || 1.0;
        this.noise = new Perlin();
        this.type = type;
    }

    /**
     * @param {number} u
     * @param {number} v
     * @param {Point3D} p
     * @returns {Color}
     */
    value(u, v, p) {
        if (this.type === 'marble') {
            const val = 0.5 * (1.0 + Math.sin(this.scale * p.z + 10.0 * this.noise.turb(p)));
            return new Color(1, 1, 1).timesNum(val);
        }
        if (this.type === 'turb') {
            return new Color(1, 1, 1).timesNum(this.noise.turb(p.timesNum(this.scale)));
        }
        return new Color(1, 1, 1).timesNum(0.5 * (1.0 + this.noise.noise(p.timesNum(this.scale))));
    }
}

/**
 * Image-based texture mapping 2D pixel coordinates (u, v) to surface colors.
 */
export class ImageTexture extends Texture {
    /** @type {Map<string, any>} */
    static cache = new Map();
    /** @type {Set<Promise<any>>} */
    static activeLoads = new Set();

    /**
     * Awaits all active image texture loading tasks.
     * @returns {Promise<void>}
     */
    static async waitForAll() {
        if (ImageTexture.activeLoads.size === 0) return;
        await Promise.allSettled(Array.from(ImageTexture.activeLoads));
    }

    /**
     * @param {string | { width: number, height: number, data: Uint8ClampedArray | Uint8Array | number[] }} [filenameOrData]
     */
    constructor(filenameOrData) {
        super();
        this.kind = 'ImageTexture';
        this.width = 0;
        this.height = 0;
        /** @type {Uint8ClampedArray | Uint8Array | number[] | null} */
        this.data = null;
        this.url = typeof filenameOrData === 'string' ? filenameOrData : '';
        this.loaded = false;

        if (filenameOrData && typeof filenameOrData === 'object' && 'data' in filenameOrData) {
            this.width = Number(filenameOrData.width) || 0;
            this.height = Number(filenameOrData.height) || 0;
            this.data = filenameOrData.data;
            this.loaded = this.width > 0 && this.height > 0 && !!this.data;
        } else if (this.url) {
            this.load(this.url);
        }
    }

    /**
     * Asynchronously loads and decodes an image URL into raw pixel data.
     * @param {string} url
     * @returns {Promise<void>}
     */
    async load(url) {
        if (!url) return;
        if (ImageTexture.cache.has(url)) {
            try {
                const cached = await ImageTexture.cache.get(url);
                if (cached && cached.data) {
                    this.width = cached.width;
                    this.height = cached.height;
                    this.data = cached.data;
                    this.loaded = true;
                }
            } catch (err) {
                console.warn(`[ImageTexture] Error applying cached texture from ${url}:`, err);
            }
            return;
        }

        const loadTask = (async () => {
            if (typeof fetch === 'function') {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image ${url}: ${response.status} ${response.statusText}`);
                }
                const blob = await response.blob();

                if (typeof createImageBitmap === 'function') {
                    const bitmap = await createImageBitmap(blob);
                    let canvas = null;
                    if (typeof OffscreenCanvas !== 'undefined') {
                        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                    } else if (typeof document !== 'undefined') {
                        canvas = document.createElement('canvas');
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                    }
                    if (canvas) {
                        const ctx = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null} */ (canvas.getContext('2d'));
                        if (ctx) {
                            ctx.drawImage(bitmap, 0, 0);
                            const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
                            return {
                                width: bitmap.width,
                                height: bitmap.height,
                                data: imgData.data,
                            };
                        }
                    }
                }

                if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    const blobUrl = URL.createObjectURL(blob);
                    try {
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = blobUrl;
                        });
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            return {
                                width: canvas.width,
                                height: canvas.height,
                                data: imgData.data,
                            };
                        }
                    } finally {
                        URL.revokeObjectURL(blobUrl);
                    }
                }
            }

            throw new Error(`No supported image decoding environment found for ${url}`);
        })();

        ImageTexture.cache.set(url, loadTask);
        ImageTexture.activeLoads.add(loadTask);

        try {
            const result = await loadTask;
            ImageTexture.cache.set(url, result);
            this.width = result.width;
            this.height = result.height;
            this.data = result.data;
            this.loaded = true;
        } catch (err) {
            console.warn(`[ImageTexture] Could not load image texture from ${url}:`, err);
        } finally {
            ImageTexture.activeLoads.delete(loadTask);
        }
    }

    /**
     * @param {number} u
     * @param {number} v
     * @param {Point3D} [p]
     * @returns {Color}
     */
    value(u, v, p) {
        // If we have no texture data, return solid cyan as a debugging aid (Peter Shirley Listing 32)
        if (!this.loaded || !this.data || this.height <= 0 || this.width <= 0) {
            return new Color(0, 1, 1);
        }

        // Clamp input texture coordinates to [0,1] x [1,0]
        u = clamp(u, 0.0, 1.0);
        v = 1.0 - clamp(v, 0.0, 1.0); // Flip V to image coordinates

        const i = Math.min(Math.max(0, Math.floor(u * this.width)), this.width - 1);
        const j = Math.min(Math.max(0, Math.floor(v * this.height)), this.height - 1);

        const index = (j * this.width + i) * 4;
        const colorScale = 1.0 / 255.0;
        return new Color(
            this.data[index] * colorScale,
            this.data[index + 1] * colorScale,
            this.data[index + 2] * colorScale
        );
    }
}

/**
 * Earth globe texture mapping earthmap.jpg to spherical coordinates.
 */
export class EarthTexture extends ImageTexture {
    /**
     * @param {string | { width: number, height: number, data: Uint8ClampedArray | Uint8Array | number[] }} [filenameOrData]
     */
    constructor(filenameOrData) {
        let defaultUrl = 'earthmap.jpg';
        try {
            if (typeof import.meta !== 'undefined' && import.meta.url) {
                defaultUrl = new URL('earthmap.jpg', import.meta.url).href;
            }
        } catch (_) {}

        super(filenameOrData || defaultUrl);
        this.kind = 'EarthTexture';
    }
}

// ----------------------------------------------------------------------------
// Planar Rectangles & Boxes
// ----------------------------------------------------------------------------

export class XYRect extends Hittable {
    /**
     * @param {number} x0
     * @param {number} x1
     * @param {number} y0
     * @param {number} y1
     * @param {number} k
     * @param {Material | MaterialSpec} material
     * @param {Vec3Like} [normal=[0, 0, 1]]
     */
    constructor(x0, x1, y0, y1, k, material, normal = new Vec3(0, 0, 1)) {
        super();
        this.kind = 'XYRect';
        this.x0 = Math.min(x0, x1);
        this.x1 = Math.max(x0, x1);
        this.y0 = Math.min(y0, y1);
        this.y1 = Math.max(y0, y1);
        this.k = Number(k);
        this.material = createMaterial(material);
        this.rectNormal = Vec3.from(normal);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        if (Math.abs(ray.direction.z) < 1e-8) return false;
        const t = (this.k - ray.origin.z) / ray.direction.z;
        if (t < tMin || t > tMax) return false;
        const x = ray.origin.x + t * ray.direction.x;
        const y = ray.origin.y + t * ray.direction.y;
        if (x < this.x0 || x > this.x1 || y < this.y0 || y > this.y1) return false;

        const dx = this.x1 - this.x0;
        const dy = this.y1 - this.y0;
        hitRecord.u = dx > 1e-8 ? (x - this.x0) / dx : 0;
        hitRecord.v = dy > 1e-8 ? (y - this.y0) / dy : 0;
        hitRecord.t = t;
        hitRecord.setFaceNormal(ray, this.rectNormal);
        hitRecord.material = this.material;
        hitRecord.p = ray.at(t);
        return true;
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        return new AABB(new Vec3(this.x0, this.y0, this.k - 0.0001), new Vec3(this.x1, this.y1, this.k + 0.0001));
    }
}

export class XZRect extends Hittable {
    /**
     * @param {number} x0
     * @param {number} x1
     * @param {number} z0
     * @param {number} z1
     * @param {number} k
     * @param {Material | MaterialSpec} material
     * @param {Vec3Like} [normal=[0, 1, 0]]
     */
    constructor(x0, x1, z0, z1, k, material, normal = new Vec3(0, 1, 0)) {
        super();
        this.kind = 'XZRect';
        this.x0 = Math.min(x0, x1);
        this.x1 = Math.max(x0, x1);
        this.z0 = Math.min(z0, z1);
        this.z1 = Math.max(z0, z1);
        this.k = Number(k);
        this.material = createMaterial(material);
        this.rectNormal = Vec3.from(normal);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        if (Math.abs(ray.direction.y) < 1e-8) return false;
        const t = (this.k - ray.origin.y) / ray.direction.y;
        if (t < tMin || t > tMax) return false;
        const x = ray.origin.x + t * ray.direction.x;
        const z = ray.origin.z + t * ray.direction.z;
        if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return false;

        const dx = this.x1 - this.x0;
        const dz = this.z1 - this.z0;
        hitRecord.u = dx > 1e-8 ? (x - this.x0) / dx : 0;
        hitRecord.v = dz > 1e-8 ? (z - this.z0) / dz : 0;
        hitRecord.t = t;
        hitRecord.setFaceNormal(ray, this.rectNormal);
        hitRecord.material = this.material;
        hitRecord.p = ray.at(t);
        return true;
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        return new AABB(new Vec3(this.x0, this.k - 0.0001, this.z0), new Vec3(this.x1, this.k + 0.0001, this.z1));
    }
}

export class YZRect extends Hittable {
    /**
     * @param {number} y0
     * @param {number} y1
     * @param {number} z0
     * @param {number} z1
     * @param {number} k
     * @param {Material | MaterialSpec} material
     * @param {Vec3Like} [normal=[1, 0, 0]]
     */
    constructor(y0, y1, z0, z1, k, material, normal = new Vec3(1, 0, 0)) {
        super();
        this.kind = 'YZRect';
        this.y0 = Math.min(y0, y1);
        this.y1 = Math.max(y0, y1);
        this.z0 = Math.min(z0, z1);
        this.z1 = Math.max(z0, z1);
        this.k = Number(k);
        this.material = createMaterial(material);
        this.rectNormal = Vec3.from(normal);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        if (Math.abs(ray.direction.x) < 1e-8) return false;
        const t = (this.k - ray.origin.x) / ray.direction.x;
        if (t < tMin || t > tMax) return false;
        const y = ray.origin.y + t * ray.direction.y;
        const z = ray.origin.z + t * ray.direction.z;
        if (y < this.y0 || y > this.y1 || z < this.z0 || z > this.z1) return false;

        const dy = this.y1 - this.y0;
        const dz = this.z1 - this.z0;
        hitRecord.u = dy > 1e-8 ? (y - this.y0) / dy : 0;
        hitRecord.v = dz > 1e-8 ? (z - this.z0) / dz : 0;
        hitRecord.t = t;
        hitRecord.setFaceNormal(ray, this.rectNormal);
        hitRecord.material = this.material;
        hitRecord.p = ray.at(t);
        return true;
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        return new AABB(new Vec3(this.k - 0.0001, this.y0, this.z0), new Vec3(this.k + 0.0001, this.y1, this.z1));
    }
}

/**
 * 3D Box primitive constructed from six planar rectangles.
 */
export class AABox extends Hittable {
    /**
     * @param {Point3DLike} p0
     * @param {Point3DLike} p1
     * @param {Material | MaterialSpec} material
     */
    constructor(p0, p1, material) {
        super();
        this.kind = 'AABox';
        const v0 = Point3D.from(p0);
        const v1 = Point3D.from(p1);
        this.boxMin = new Point3D(Math.min(v0.x, v1.x), Math.min(v0.y, v1.y), Math.min(v0.z, v1.z));
        this.boxMax = new Point3D(Math.max(v0.x, v1.x), Math.max(v0.y, v1.y), Math.max(v0.z, v1.z));
        this.material = createMaterial(material);
        this.sides = new HittableList([
            new XYRect(this.boxMin.x, this.boxMax.x, this.boxMin.y, this.boxMax.y, this.boxMax.z, this.material, new Vec3(0, 0, 1)),
            new XYRect(this.boxMin.x, this.boxMax.x, this.boxMin.y, this.boxMax.y, this.boxMin.z, this.material, new Vec3(0, 0, -1)),
            new XZRect(this.boxMin.x, this.boxMax.x, this.boxMin.z, this.boxMax.z, this.boxMax.y, this.material, new Vec3(0, 1, 0)),
            new XZRect(this.boxMin.x, this.boxMax.x, this.boxMin.z, this.boxMax.z, this.boxMin.y, this.material, new Vec3(0, -1, 0)),
            new YZRect(this.boxMin.y, this.boxMax.y, this.boxMin.z, this.boxMax.z, this.boxMax.x, this.material, new Vec3(1, 0, 0)),
            new YZRect(this.boxMin.y, this.boxMax.y, this.boxMin.z, this.boxMax.z, this.boxMin.x, this.material, new Vec3(-1, 0, 0)),
        ]);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        return this.sides.hitBy(ray, tMin, tMax, hitRecord);
    }

    /**
     * @returns {AABB}
     */
    boundingBox() {
        return new AABB(this.boxMin, this.boxMax);
    }
}

// ----------------------------------------------------------------------------
// Geometry Instances (Transformations)
// ----------------------------------------------------------------------------

export class Translate extends Hittable {
    /**
     * @param {Hittable} hittable
     * @param {Vec3Like} offset
     */
    constructor(hittable, offset) {
        super();
        this.kind = 'Translate';
        this.hittable = hittable;
        this.offset = Vec3.from(offset);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const movedRay = new Ray(ray.origin.minus(this.offset), ray.direction, ray.time);
        if (!this.hittable.hitBy(movedRay, tMin, tMax, hitRecord)) return false;
        if (hitRecord.p) {
            hitRecord.p = hitRecord.p.plus(this.offset);
        }
        return true;
    }

    /**
     * @returns {AABB | null}
     */
    boundingBox() {
        const b = this.hittable.boundingBox();
        if (!b) return null;
        return new AABB(b.minimum.plus(this.offset), b.maximum.plus(this.offset));
    }
}

export class RotateY extends Hittable {
    /**
     * @param {Hittable} hittable
     * @param {number} angleDegrees
     */
    constructor(hittable, angleDegrees) {
        super();
        this.kind = 'RotateY';
        this.hittable = hittable;
        const radians = degreesToRadians(angleDegrees);
        this.sinTheta = Math.sin(radians);
        this.cosTheta = Math.cos(radians);
        /** @type {AABB | null} */
        this.bbox = null;

        const box = hittable.boundingBox();
        if (box) {
            let minP = new Point3D(INFINITY, INFINITY, INFINITY);
            let maxP = new Point3D(-INFINITY, -INFINITY, -INFINITY);
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    for (let k = 0; k < 2; k++) {
                        const x = i * box.maximum.x + (1 - i) * box.minimum.x;
                        const y = j * box.maximum.y + (1 - j) * box.minimum.y;
                        const z = k * box.maximum.z + (1 - k) * box.minimum.z;
                        const newX = this.cosTheta * x + this.sinTheta * z;
                        const newZ = -this.sinTheta * x + this.cosTheta * z;
                        const tester = new Point3D(newX, y, newZ);
                        minP = new Point3D(Math.min(minP.x, tester.x), Math.min(minP.y, tester.y), Math.min(minP.z, tester.z));
                        maxP = new Point3D(Math.max(maxP.x, tester.x), Math.max(maxP.y, tester.y), Math.max(maxP.z, tester.z));
                    }
                }
            }
            this.bbox = new AABB(minP, maxP);
        }
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const origin = ray.origin.copy();
        const direction = ray.direction.copy();

        origin.x = this.cosTheta * ray.origin.x - this.sinTheta * ray.origin.z;
        origin.z = this.sinTheta * ray.origin.x + this.cosTheta * ray.origin.z;

        direction.x = this.cosTheta * ray.direction.x - this.sinTheta * ray.direction.z;
        direction.z = this.sinTheta * ray.direction.x + this.cosTheta * ray.direction.z;

        const rotatedRay = new Ray(origin, direction, ray.time);
        if (!this.hittable.hitBy(rotatedRay, tMin, tMax, hitRecord)) return false;

        if (hitRecord.p && hitRecord.normal) {
            const p = hitRecord.p.copy();
            const normal = hitRecord.normal.copy();

            p.x = this.cosTheta * hitRecord.p.x + this.sinTheta * hitRecord.p.z;
            p.z = -this.sinTheta * hitRecord.p.x + this.cosTheta * hitRecord.p.z;

            normal.x = this.cosTheta * hitRecord.normal.x + this.sinTheta * hitRecord.normal.z;
            normal.z = -this.sinTheta * hitRecord.normal.x + this.cosTheta * hitRecord.normal.z;

            hitRecord.p = p;
            hitRecord.normal = normal;
        }
        return true;
    }

    /**
     * @returns {AABB | null}
     */
    boundingBox() {
        return this.bbox;
    }
}

// ----------------------------------------------------------------------------
// Materials
// ----------------------------------------------------------------------------

/**
 * Base Material class defining how rays scatter off surfaces.
 */
export class Material {
    constructor() {
        /** @type {string} */
        this.kind = 'Material';
        /** @type {Ray | null} */
        this.scattered = null;
        /** @type {Color | null} */
        this.attenuation = null;
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        throw new Error('Method "scatter" is not implemented for this class.');
    }

    /**
     * @param {Ray|number} [rInOrU]
     * @param {HitRecord|number} [recOrV]
     * @param {Point3D} [p]
     * @returns {Color}
     */
    emitted(rInOrU, recOrV, p) {
        return BLACK.copy();
    }

    /** @returns {string} */
    toString() {
        return `<Material()>`;
    }
}

/**
 * Lambertian (diffuse) material.
 */
export class Lambertian extends Material {
    /** @type {string} */
    static defaultDiffuseMethod = 'lambertian';

    /**
     * @param {ColorLike | Texture} [albedo]
     * @param {'lambertian'|'rejection'|'hemisphere'} [diffuseMethod]
     */
    constructor(albedo, diffuseMethod) {
        super();
        this.kind = 'Lambertian';
        this.diffuseMethod = diffuseMethod || Lambertian.defaultDiffuseMethod || 'lambertian';
        if (albedo instanceof Texture) {
            this.albedo = albedo;
        } else if (albedo) {
            this.albedo = new SolidColor(albedo);
        } else {
            this.albedo = new SolidColor(new Color(0.5, 0.5, 0.5));
        }
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        if (!hitRecord.p || !hitRecord.normal) return false;
        let scatterDirection;
        const method = this.diffuseMethod || Lambertian.defaultDiffuseMethod || 'lambertian';

        if (method === 'rejection') {
            scatterDirection = hitRecord.normal.plus(randomInUnitSphere());
        } else if (method === 'hemisphere') {
            scatterDirection = randomInHemisphere(hitRecord.normal);
        } else {
            // True Lambertian reflection (normal + random unit vector)
            scatterDirection = hitRecord.normal.plus(randomUnitVector());
        }

        if (scatterDirection.nearZero()) {
            scatterDirection = hitRecord.normal.copy();
        }

        this.scattered = new Ray(hitRecord.p, scatterDirection, rIn.time);
        this.attenuation = this.albedo.value(hitRecord.u, hitRecord.v, hitRecord.p);
        return true;
    }

    /** @returns {string} */
    toString() {
        return `<Lambertian(albedo=${this.albedo})>`;
    }
}

/**
 * Metal (specular reflection) material with adjustable roughness (fuzz).
 */
export class Metal extends Material {
    /**
     * @param {ColorLike} [albedo]
     * @param {number} [fuzz=0.0] Roughness factor in [0, 1].
     */
    constructor(albedo, fuzz = 0.0) {
        super();
        this.kind = 'Metal';
        this.albedo = parseColor(albedo, new Color(0.8, 0.8, 0.8));
        const rawFuzz = Number(fuzz);
        this.fuzz = rawFuzz < 1 ? Math.max(0, rawFuzz) : 1.0;
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        if (!hitRecord.p || !hitRecord.normal) return false;
        const reflected = reflect(rIn.direction.unitVector(), hitRecord.normal);
        const scatteredDir = reflected.plus(randomInUnitSphere().timesNum(this.fuzz));
        this.scattered = new Ray(hitRecord.p, scatteredDir, rIn.time);
        this.attenuation = this.albedo;
        return this.scattered.direction.dot(hitRecord.normal) > 0;
    }

    /** @returns {string} */
    toString() {
        return `<Metal(albedo=${this.albedo}, fuzz=${this.fuzz})>`;
    }
}

/**
 * Dielectric (refractive glass / water) material using Snell's Law and Schlick's approximation.
 */
export class Dielectric extends Material {
    /**
     * @param {number} [indexOfRefraction=1.5]
     */
    constructor(indexOfRefraction = 1.5) {
        super();
        this.kind = 'Dielectric';
        this.indexOfRefraction = Number(indexOfRefraction) || 1.5;
    }

    /**
     * @param {number} cosine
     * @param {number} refIdx
     * @returns {number}
     */
    reflectance(cosine, refIdx) {
        let r0 = (1 - refIdx) / (1 + refIdx);
        r0 = r0 * r0;
        return r0 + (1 - r0) * Math.pow(1 - cosine, 5);
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        if (!hitRecord.p || !hitRecord.normal) return false;
        this.attenuation = new Color(1.0, 1.0, 1.0);
        const refractionRatio = hitRecord.frontFace ? (1.0 / this.indexOfRefraction) : this.indexOfRefraction;

        const unitDirection = rIn.direction.unitVector();
        const cosTheta = Math.min(unitDirection.negative().dot(hitRecord.normal), 1.0);
        const sinTheta = Math.sqrt(Math.max(0, 1.0 - (cosTheta * cosTheta)));

        const cannotRefract = refractionRatio * sinTheta > 1.0;
        let direction;

        if (cannotRefract || (this.reflectance(cosTheta, refractionRatio) > randomDouble(0.0, 1.0))) {
            direction = reflect(unitDirection, hitRecord.normal);
        } else {
            direction = refract(unitDirection, hitRecord.normal, refractionRatio);
        }

        this.scattered = new Ray(hitRecord.p, direction, rIn.time);
        return true;
    }

    /** @returns {string} */
    toString() {
        return `<Dielectric(indexOfRefraction=${this.indexOfRefraction})>`;
    }
}

/**
 * Surface normal diagnostic material.
 */
export class NormalMaterial extends Material {
    constructor() {
        super();
        this.kind = 'NormalMaterial';
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        if (!hitRecord.normal) return false;
        this.attenuation = hitRecord.normal.plusNum(1.0).timesNum(0.5);
        this.scattered = null;
        return false;
    }

    /** @returns {string} */
    toString() {
        return `<NormalMaterial()>`;
    }
}

/**
 * Diffuse light material for area light sources.
 */
export class DiffuseLight extends Material {
    /**
     * @param {ColorLike | Texture} [emit]
     */
    constructor(emit) {
        super();
        this.kind = 'DiffuseLight';
        if (emit instanceof Texture) {
            this.emitTex = emit;
        } else if (emit) {
            this.emitTex = new SolidColor(emit);
        } else {
            this.emitTex = new SolidColor(WHITE);
        }
    }

    /**
     * @param {Ray|number} [rInOrU]
     * @param {HitRecord|number} [recOrV]
     * @param {Point3D} [p]
     * @returns {Color}
     */
    emitted(rInOrU, recOrV, p) {
        if (typeof rInOrU === 'number' && typeof recOrV === 'number') {
            return this.emitTex.value(rInOrU, recOrV, p || new Point3D(0, 0, 0));
        }
        const rec = /** @type {HitRecord} */ (recOrV);
        if (!rec) return this.emitTex.value(0, 0, new Point3D(0, 0, 0));
        return this.emitTex.value(rec.u, rec.v, rec.p || new Point3D(0, 0, 0));
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        this.scattered = null;
        this.attenuation = BLACK.copy();
        return false;
    }

    /** @returns {string} */
    toString() {
        return `<DiffuseLight()>`;
    }
}

// ----------------------------------------------------------------------------
// Volumes / Participating Media (Fog & Smoke)
// ----------------------------------------------------------------------------

export class Isotropic extends Material {
    /**
     * @param {ColorLike | Texture} colorOrTexture
     */
    constructor(colorOrTexture) {
        super();
        this.kind = 'Isotropic';
        this.albedo = (colorOrTexture instanceof Texture) ? colorOrTexture : new SolidColor(colorOrTexture);
    }

    /**
     * @param {Ray} rIn
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    scatter(rIn, hitRecord) {
        if (!hitRecord.p) return false;
        this.scattered = new Ray(hitRecord.p, randomUnitVector(), rIn.time);
        this.attenuation = this.albedo.value(hitRecord.u, hitRecord.v, hitRecord.p);
        return true;
    }
}

export class ConstantMedium extends Hittable {
    /**
     * @param {Hittable} boundary
     * @param {number} density
     * @param {ColorLike | Texture} colorOrTexture
     */
    constructor(boundary, density, colorOrTexture) {
        super();
        this.kind = 'ConstantMedium';
        this.boundary = boundary;
        this.negInvDensity = -1.0 / (Number(density) || 0.01);
        this.phaseFunction = new Isotropic(colorOrTexture);
    }

    /**
     * @param {Ray} ray
     * @param {number} tMin
     * @param {number} tMax
     * @param {HitRecord} hitRecord
     * @returns {boolean}
     */
    hitBy(ray, tMin, tMax, hitRecord) {
        const rec1 = new HitRecord();
        const rec2 = new HitRecord();

        if (!this.boundary.hitBy(ray, -INFINITY, INFINITY, rec1)) return false;
        if (!this.boundary.hitBy(ray, rec1.t + 0.0001, INFINITY, rec2)) return false;

        if (rec1.t < tMin) rec1.t = tMin;
        if (rec2.t > tMax) rec2.t = tMax;
        if (rec1.t >= rec2.t) return false;

        if (rec1.t < 0) rec1.t = 0;

        const rayLength = ray.direction.length();
        const distanceInsideBoundary = (rec2.t - rec1.t) * rayLength;
        const hitDistance = this.negInvDensity * Math.log(Math.max(1e-15, randomDouble()));

        if (hitDistance > distanceInsideBoundary) return false;

        hitRecord.t = rec1.t + hitDistance / rayLength;
        hitRecord.p = ray.at(hitRecord.t);
        hitRecord.normal = new Vec3(1, 0, 0);
        hitRecord.frontFace = true;
        hitRecord.material = this.phaseFunction;
        return true;
    }

    /**
     * @returns {AABB | null}
     */
    boundingBox() {
        return this.boundary.boundingBox();
    }
}

// ----------------------------------------------------------------------------
// Material & Hittable Deserializer / Factories
// ----------------------------------------------------------------------------

/**
 * Hydrates a texture specification or returns the existing Texture instance.
 * @param {any} spec
 * @returns {Texture}
 */
export function createTexture(spec) {
    if (!spec) return new SolidColor(new Color(0, 0, 0));
    if (spec instanceof Texture) return spec;
    if (typeof spec === 'object' && spec.kind) {
        if (spec.kind === 'SolidColor') return new SolidColor(spec.color);
        if (spec.kind === 'CheckerTexture' || spec.kind === 'Checker') {
            return new CheckerTexture(spec.scale ?? 10.0, createTexture(spec.c1 ?? spec.even), createTexture(spec.c2 ?? spec.odd));
        }
        if (spec.kind === 'NoiseTexture' || spec.kind === 'Noise') {
            return new NoiseTexture(spec.scale ?? 1.0, spec.type ?? 'marble');
        }
        if (spec.kind === 'ImageTexture' || spec.kind === 'Image') {
            return new ImageTexture(spec.filename || spec.url || spec.image || spec.data);
        }
        if (spec.kind === 'EarthTexture' || spec.kind === 'Earth') {
            return new EarthTexture(spec.filename || spec.url || spec.image || spec.data);
        }
    }
    return new SolidColor(spec);
}

/**
 * Hydrates a material specification or returns the existing Material instance.
 * @param {MaterialSpec | null | undefined} spec
 * @returns {Material}
 */
export function createMaterial(spec) {
    if (!spec) return new Lambertian(new Color(0.5, 0.5, 0.5));
    if (spec instanceof Material) return spec;

    if (spec.kind === 'Lambertian') {
        const albedoSpec = spec.albedo ?? spec.color;
        const albedo = (albedoSpec && typeof albedoSpec === 'object' && 'kind' in albedoSpec)
            ? createTexture(albedoSpec)
            : albedoSpec;
        return new Lambertian(albedo, spec.diffuseMethod);
    }
    if (spec.kind === 'Metal') {
        return new Metal(spec.albedo ?? spec.color, spec.fuzz);
    }
    if (spec.kind === 'Dielectric') {
        return new Dielectric(spec.indexOfRefraction ?? spec.refractiveIndex ?? spec.ir);
    }
    if (spec.kind === 'NormalMaterial') {
        return new NormalMaterial();
    }
    if (spec.kind === 'DiffuseLight') {
        const emitSpec = spec.emit ?? spec.color;
        const emit = (emitSpec && typeof emitSpec === 'object' && 'kind' in emitSpec)
            ? createTexture(emitSpec)
            : emitSpec;
        return new DiffuseLight(emit);
    }
    if (spec.kind === 'Isotropic') {
        const albedoSpec = spec.albedo ?? spec.color;
        const albedo = (albedoSpec && typeof albedoSpec === 'object' && 'kind' in albedoSpec)
            ? createTexture(albedoSpec)
            : (albedoSpec || WHITE);
        return new Isotropic(albedo);
    }
    return new Lambertian(createTexture(spec));
}

/**
 * Hydrates a hittable object specification or returns the existing Hittable instance.
 * @param {HittableSpec | any} spec
 * @returns {Hittable}
 */
export function createHittable(spec) {
    if (spec instanceof Hittable) return spec;
    if (spec.kind === 'Sphere') {
        return new Sphere(spec.center, spec.radius, spec.material);
    }
    if (spec.kind === 'MovingSphere') {
        return new MovingSphere(spec.center0, spec.center1, spec.time0, spec.time1, spec.radius, spec.material);
    }
    if (spec.kind === 'XYRect') {
        return new XYRect(spec.x0, spec.x1, spec.y0, spec.y1, spec.k, spec.material);
    }
    if (spec.kind === 'XZRect') {
        return new XZRect(spec.x0, spec.x1, spec.z0, spec.z1, spec.k, spec.material);
    }
    if (spec.kind === 'YZRect') {
        return new YZRect(spec.y0, spec.y1, spec.z0, spec.z1, spec.k, spec.material);
    }
    if (spec.kind === 'AABox' || spec.kind === 'Box' || spec.kind === 'box') {
        return new AABox(spec.p0, spec.p1, spec.material);
    }
    if (spec.kind === 'Translate') {
        return new Translate(createHittable(spec.hittable ?? spec.object), spec.offset);
    }
    if (spec.kind === 'RotateY') {
        return new RotateY(createHittable(spec.hittable ?? spec.object), spec.angle ?? spec.angleDegrees);
    }
    if (spec.kind === 'ConstantMedium') {
        const boundary = createHittable(spec.boundary);
        const textureOrColor = (spec.colorOrTexture && typeof spec.colorOrTexture === 'object' && 'kind' in spec.colorOrTexture)
            ? createTexture(spec.colorOrTexture)
            : (spec.colorOrTexture ?? spec.color ?? WHITE);
        return new ConstantMedium(boundary, spec.density, textureOrColor);
    }
    if (spec.kind === 'HittableList') {
        const list = new HittableList();
        if (Array.isArray(spec.hittables || spec.objects)) {
            for (const item of (spec.hittables || spec.objects)) {
                list.add(createHittable(item));
            }
        }
        return list;
    }
    const unknownKind = /** @type {any} */ (spec).kind;
    throw new Error(`Unknown hittable kind: ${unknownKind}`);
}

// ----------------------------------------------------------------------------
// Camera
// ----------------------------------------------------------------------------

/**
 * Camera with adjustable position, orientation, field of view, shutter time, and depth-of-field blur.
 */
export class Camera {
    /**
     * @param {CameraSpec} [spec={}]
     */
    constructor(spec = {}) {
        const aspectRatio = spec.aspectRatio ?? (16.0 / 9.0);
        const lookfrom = spec.lookfrom ? Point3D.from(spec.lookfrom) : null;
        const lookat = spec.lookat ? Point3D.from(spec.lookat) : new Point3D(0, 0, -1);
        const vup = spec.vup ? Vec3.from(spec.vup) : new Vec3(0, 1, 0);
        const vfov = spec.vfov ?? 90;
        const aperture = spec.aperture ?? 0.0;
        const focusDist = spec.focusDist ?? spec.focalLength ?? (lookfrom ? lookfrom.minus(lookat).length() : 1.0);
        this.time0 = Number(spec.time0 ?? 0.0);
        this.time1 = Number(spec.time1 ?? 0.0);

        const theta = degreesToRadians(vfov);
        const h = Math.tan(theta / 2);
        this.viewportHeight = 2.0 * h;
        this.viewportWidth = aspectRatio * this.viewportHeight;

        if (!lookfrom) {
            this.origin = new Point3D(0.0, 0.0, 0.0);
            this.horizontal = new Vec3(this.viewportWidth * focusDist, 0.0, 0.0);
            this.vertical = new Vec3(0.0, this.viewportHeight * focusDist, 0.0);
            this.u = new Vec3(1, 0, 0);
            this.v = new Vec3(0, 1, 0);
            this.w = new Vec3(0, 0, 1);
            this.lowerLeftCorner = this.origin
                .minus(this.horizontal.divByNum(2.0))
                .minus(this.vertical.divByNum(2.0))
                .minus(new Vec3(0, 0, focusDist));
            this.lensRadius = aperture / 2.0;
        } else {
            this.w = lookfrom.minus(lookat).unitVector();
            let uCandidate = vup.cross(this.w);
            if (uCandidate.nearZero()) {
                // look direction is nearly parallel to vup; pick an alternate reference up vector
                const altUp = Math.abs(vup.z) > 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1);
                uCandidate = altUp.cross(this.w);
            }
            this.u = uCandidate.unitVector();
            this.v = this.w.cross(this.u);

            this.origin = lookfrom.copy();
            this.horizontal = this.u.timesNum(this.viewportWidth * focusDist);
            this.vertical = this.v.timesNum(this.viewportHeight * focusDist);
            this.lowerLeftCorner = this.origin
                .minus(this.horizontal.divByNum(2.0))
                .minus(this.vertical.divByNum(2.0))
                .minus(this.w.timesNum(focusDist));

            this.lensRadius = aperture / 2.0;
        }
    }

    /**
     * Generates a primary ray from the camera through viewport coordinates (s, t).
     * @param {number} s Horizontal UV coordinate in [0, 1].
     * @param {number} t Vertical UV coordinate in [0, 1].
     * @returns {Ray}
     */
    getRay(s, t) {
        const rayTime = this.time0 + (this.time1 - this.time0) * randomDouble();
        if (this.lensRadius > 0) {
            const rd = randomInUnitDisk().timesNum(this.lensRadius);
            const offset = this.u.timesNum(rd.x).plus(this.v.timesNum(rd.y));
            const direction = this.lowerLeftCorner
                .plus(this.horizontal.timesNum(s))
                .plus(this.vertical.timesNum(t))
                .minus(this.origin)
                .minus(offset);
            return new Ray(this.origin.plus(offset), direction, rayTime);
        }

        const direction = this.lowerLeftCorner
            .plus(this.horizontal.timesNum(s))
            .plus(this.vertical.timesNum(t))
            .minus(this.origin);
        return new Ray(this.origin, direction, rayTime);
    }
}

// ----------------------------------------------------------------------------
// Mathematical & Random Helpers
// ----------------------------------------------------------------------------

/**
 * Converts degrees to radians.
 * @param {number} degrees
 * @returns {number}
 */
export function degreesToRadians(degrees) {
    return degrees * (PI / 180.0);
}

/**
 * Returns a uniform random float in [min, max).
 * @param {number} [min=0.0]
 * @param {number} [max=1.0]
 * @returns {number}
 */
export function randomDouble(min = 0.0, max = 1.0) {
    return min + (max - min) * Math.random();
}

/**
 * Returns a random integer in [min, max].
 * @param {number} [min=0]
 * @param {number} [max=1]
 * @returns {number}
 */
export function randomInt(min = 0, max = 1) {
    return Math.floor(randomDouble(min, max + 1));
}

/**
 * Clamps value x into range [min, max].
 * @param {number} x
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(x, min, max) {
    if (Number.isNaN(x)) return min;
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

/**
 * Generates a random point inside a unit sphere.
 * @returns {Vec3}
 */
export function randomInUnitSphere() {
    while (true) {
        const p = Vec3.random(-1.0, 1.0);
        if (p.lengthSquared() >= 1.0) continue;
        return p;
    }
}

/**
 * Generates a random unit vector on the unit sphere surface.
 * @returns {Vec3}
 */
export function randomUnitVector() {
    return randomInUnitSphere().unitVector();
}

/**
 * Generates a random unit vector in the hemisphere aligned with surface normal.
 * @param {Vec3} normal
 * @returns {Vec3}
 */
export function randomInHemisphere(normal) {
    const inUnitSphere = randomUnitVector();
    return inUnitSphere.dot(normal) > 0.0 ? inUnitSphere : inUnitSphere.negative();
}

/**
 * Generates a random 2D point inside the unit disk (z = 0).
 * @returns {Vec3}
 */
export function randomInUnitDisk() {
    while (true) {
        const p = new Vec3(randomDouble(-1.0, 1.0), randomDouble(-1.0, 1.0), 0.0);
        if (p.lengthSquared() >= 1.0) continue;
        return p;
    }
}

/**
 * Computes specular reflection vector R = V - 2 * (V . N) * N.
 * @param {Vec3} v Incident vector.
 * @param {Vec3} n Surface unit normal.
 * @returns {Vec3}
 */
export function reflect(v, n) {
    return v.minus(n.timesNum(v.dot(n) * 2.0));
}

/**
 * Computes Snell's refraction vector.
 * @param {Vec3} uv Incident unit vector.
 * @param {Vec3} n Surface unit normal.
 * @param {number} etaiOverEtat Ratio of refractive indices.
 * @returns {Vec3}
 */
export function refract(uv, n, etaiOverEtat) {
    const cosTheta = Math.min(uv.negative().dot(n), 1.0);
    const rOutPerp = uv.plus(n.timesNum(cosTheta)).timesNum(etaiOverEtat);
    const rOutParallel = n.timesNum(-Math.sqrt(Math.abs(1.0 - rOutPerp.lengthSquared())));
    return rOutPerp.plus(rOutParallel);
}

/**
 * Checks if point (x, y) is within rectangular box bounds [left, right] x [top, bottom].
 * @param {number} x
 * @param {number} y
 * @param {number} left
 * @param {number} right
 * @param {number} top
 * @param {number} bottom
 * @returns {boolean}
 */
export function inBox(x, y, left, right, top, bottom) {
    return left <= x && x <= right && top <= y && y <= bottom;
}

// ----------------------------------------------------------------------------
// Scene Presets
// ----------------------------------------------------------------------------

/**
 * Creates built-in lecture demo scenes or parses a custom array of objects.
 * @param {string | HittableSpec[]} [sceneSpec='diffuse']
 * @param {Record<string, any>} [options={}]
 * @returns {HittableList}
 */
export function createWorld(sceneSpec = 'diffuse', options = {}) {
    const world = new HittableList();

    if (Array.isArray(sceneSpec)) {
        for (const spec of sceneSpec) {
            world.add(createHittable(spec));
        }
        return world;
    }

    const preset = typeof sceneSpec === 'string' ? sceneSpec.toLowerCase() : 'diffuse';

    switch (preset) {
        case 'sphere': {
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, new Lambertian(new Color(52 / 255, 152 / 255, 219 / 255))));
            break;
        }

        case 'normals': {
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, new NormalMaterial()));
            world.add(new Sphere(new Point3D(0.0, -100.5, -1.0), 100.0, new NormalMaterial()));
            break;
        }

        case 'diffuse': {
            const matGround = new Lambertian(new Color(0.5, 0.5, 0.5));
            const matCenter = new Lambertian(new Color(0.5, 0.5, 0.5));
            world.add(new Sphere(new Point3D(0.0, -100.5, -1.0), 100.0, matGround));
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, matCenter));
            break;
        }

        case 'materials': {
            const matGround = new Lambertian(new Color(0.8, 0.8, 0.0));
            const matCenter = new Lambertian(new Color(0.7, 0.3, 0.3));
            const matLeft = new Metal(new Color(0.8, 0.8, 0.8), 0.0);
            const matRight = new Metal(new Color(0.8, 0.6, 0.2), 0.5);

            world.add(new Sphere(new Point3D(0.0, -100.5, -1.0), 100.0, matGround));
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, matCenter));
            world.add(new Sphere(new Point3D(-1.0, 0.0, -1.0), 0.5, matLeft));
            world.add(new Sphere(new Point3D(1.0, 0.0, -1.0), 0.5, matRight));
            break;
        }

        case 'dielectric': {
            const matGround = new Lambertian(new Color(0.8, 0.8, 0.0));
            const matCenter = new Lambertian(new Color(0.1, 0.2, 0.5));
            const matLeft = new Dielectric(1.5);
            const matRight = new Metal(new Color(0.8, 0.6, 0.2), 0.0);

            world.add(new Sphere(new Point3D(0.0, -100.5, -1.0), 100.0, matGround));
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, matCenter));
            world.add(new Sphere(new Point3D(-1.05, 0.0, -1.0), 0.5, matLeft));
            world.add(new Sphere(new Point3D(-1.05, 0.0, -1.0), -0.45, matLeft));
            world.add(new Sphere(new Point3D(1.0, 0.0, -1.0), 0.5, matRight));
            break;
        }

        case 'defocus':
        case 'dof': {
            const matGround = new Lambertian(new Color(0.5, 0.5, 0.5));
            world.add(new Sphere(new Point3D(0.0, -100.5, -1.0), 100.0, matGround));
            world.add(new Sphere(new Point3D(0.0, 0.0, -1.0), 0.5, new Dielectric(1.5)));
            world.add(new Sphere(new Point3D(-1.0, 0.0, -1.0), 0.5, new Lambertian(new Color(0.4, 0.2, 0.1))));
            world.add(new Sphere(new Point3D(1.0, 0.0, -1.0), 0.5, new Metal(new Color(0.7, 0.6, 0.5), 0.0)));
            world.add(new Sphere(new Point3D(-0.4, -0.3, -0.4), 0.2, new Lambertian(new Color(0.8, 0.2, 0.2))));
            world.add(new Sphere(new Point3D(0.5, -0.2, -1.8), 0.3, new Lambertian(new Color(0.2, 0.8, 0.2))));
            break;
        }

        case 'camera':
        case 'randomscene': {
            const groundMat = new Lambertian(new Color(0.5, 0.5, 0.5));
            world.add(new Sphere(new Point3D(0, -1000, 0), 1000, groundMat));

            const randomAmount = 11;
            for (let i = -randomAmount; i < randomAmount; ++i) {
                for (let j = -randomAmount; j < randomAmount; ++j) {
                    const matProb = randomDouble();
                    const center = new Point3D(i + (0.9 * randomDouble()), 0.2, j + (0.9 * randomDouble()));

                    if (center.minus(new Point3D(4, 0.2, 0)).length() > 0.9) {
                        if (matProb < 0.8) {
                            const albedo = Color.random().times(Color.random());
                            world.add(new Sphere(center, 0.2, new Lambertian(albedo)));
                        } else if (matProb < 0.95) {
                            const albedo = Color.random(0.5, 1.0);
                            const fuzz = randomDouble(0, 0.5);
                            world.add(new Sphere(center, 0.2, new Metal(albedo, fuzz)));
                        } else {
                            world.add(new Sphere(center, 0.2, new Dielectric(1.5)));
                        }
                    }
                }
            }

            world.add(new Sphere(new Point3D(0, 1, 0), 1.0, new Dielectric(1.5)));
            world.add(new Sphere(new Point3D(-4, 1, 0), 1.0, new Lambertian(new Color(0.4, 0.2, 0.1))));
            world.add(new Sphere(new Point3D(4, 1, 0), 1.0, new Metal(new Color(0.7, 0.6, 0.5), 0.0)));
            break;
        }

        case 'motionblur': {
            const groundMat = new Lambertian(new Color(0.8, 0.8, 0.0));
            world.add(new Sphere(new Point3D(0, -1000, 0), 1000, groundMat));

            world.add(new Sphere(new Point3D(-2.5, 1, 0), 1.0, new Dielectric(1.5)));
            world.add(new Sphere(new Point3D(2.5, 1, 0), 1.0, new Metal(new Color(0.7, 0.6, 0.5), 0.0)));

            const movingMat = new Lambertian(new Color(0.9, 0.2, 0.2));
            world.add(new MovingSphere(new Point3D(0, 1.0, 0), new Point3D(0, 1.5, 0), 0.0, 1.0, 1.0, movingMat));
            break;
        }

        case 'bvh': {
            const groundMat = new Lambertian(new Color(0.5, 0.5, 0.5));
            world.add(new Sphere(new Point3D(0, -1000, 0), 1000, groundMat));
            for (let i = -6; i <= 6; i++) {
                for (let j = -6; j <= 6; j++) {
                    const center = new Point3D(i * 1.2, 0.3, j * 1.2);
                    const albedo = Color.random(0.3, 0.9);
                    world.add(new Sphere(center, 0.3, new Lambertian(albedo)));
                }
            }
            break;
        }

        case 'checker': {
            const checker = new CheckerTexture(10.0, new Color(0.2, 0.3, 0.1), new Color(0.9, 0.9, 0.9));
            world.add(new Sphere(new Point3D(0, -10, 0), 10, new Lambertian(checker)));
            world.add(new Sphere(new Point3D(0, 10, 0), 10, new Lambertian(checker)));
            break;
        }

        case 'perlin': {
            const perlin = new NoiseTexture(4.0, 'marble');
            world.add(new Sphere(new Point3D(0, -1000, 0), 1000, new Lambertian(perlin)));
            world.add(new Sphere(new Point3D(0, 2, 0), 2, new Lambertian(perlin)));
            break;
        }

        case 'earth': {
            const earthTex = new EarthTexture();
            world.add(new Sphere(new Point3D(0, 0, 0), 2, new Lambertian(earthTex)));
            break;
        }

        case 'simplelight':
        case 'rectlight': {
            const perlinTex = new NoiseTexture(4.0, 'turb');
            world.add(new Sphere(new Point3D(0, -1000, 0), 1000, new Lambertian(perlinTex)));
            world.add(new Sphere(new Point3D(0, 2, 0), 2, new Lambertian(perlinTex)));

            const difflight = new DiffuseLight(new Color(4, 4, 4));
            world.add(new XYRect(3, 5, 1, 3, -2, difflight));
            break;
        }

        case 'cornell':
        case 'cornellbox': {
            const red = new Lambertian(new Color(0.65, 0.05, 0.05));
            const white = new Lambertian(new Color(0.73, 0.73, 0.73));
            const green = new Lambertian(new Color(0.12, 0.45, 0.15));
            const light = new DiffuseLight(new Color(15, 15, 15));

            world.add(new YZRect(0, 555, 0, 555, 555, green));
            world.add(new YZRect(0, 555, 0, 555, 0, red));
            world.add(new XZRect(213, 343, 227, 332, 554, light));
            world.add(new XZRect(0, 555, 0, 555, 0, white));
            world.add(new XZRect(0, 555, 0, 555, 555, white));
            world.add(new XYRect(0, 555, 0, 555, 555, white));

            break;
        }

        case 'cornellinstances':
        case 'cornellboxes': {
            const red = new Lambertian(new Color(0.65, 0.05, 0.05));
            const white = new Lambertian(new Color(0.73, 0.73, 0.73));
            const green = new Lambertian(new Color(0.12, 0.45, 0.15));
            const light = new DiffuseLight(new Color(15, 15, 15));

            world.add(new YZRect(0, 555, 0, 555, 555, green));
            world.add(new YZRect(0, 555, 0, 555, 0, red));
            world.add(new XZRect(213, 343, 227, 332, 554, light));
            world.add(new XZRect(0, 555, 0, 555, 0, white));
            world.add(new XZRect(0, 555, 0, 555, 555, white));
            world.add(new XYRect(0, 555, 0, 555, 555, white));

            let box1 = /** @type {Hittable} */ (new AABox(new Point3D(0, 0, 0), new Point3D(165, 330, 165), white));
            box1 = new RotateY(box1, 15);
            box1 = new Translate(box1, new Vec3(265, 0, 295));
            world.add(box1);

            let box2 = /** @type {Hittable} */ (new AABox(new Point3D(0, 0, 0), new Point3D(165, 165, 165), white));
            box2 = new RotateY(box2, -18);
            box2 = new Translate(box2, new Vec3(130, 0, 65));
            world.add(box2);
            break;
        }

        case 'cornellsmoke':
        case 'cornellfog': {
            const red = new Lambertian(new Color(0.65, 0.05, 0.05));
            const white = new Lambertian(new Color(0.73, 0.73, 0.73));
            const green = new Lambertian(new Color(0.12, 0.45, 0.15));
            const light = new DiffuseLight(new Color(15, 15, 15));

            world.add(new YZRect(0, 555, 0, 555, 555, green));
            world.add(new YZRect(0, 555, 0, 555, 0, red));
            world.add(new XZRect(213, 343, 227, 332, 554, light));
            world.add(new XZRect(0, 555, 0, 555, 0, white));
            world.add(new XZRect(0, 555, 0, 555, 555, white));
            world.add(new XYRect(0, 555, 0, 555, 555, white));

            let box1 = /** @type {Hittable} */ (new AABox(new Point3D(0, 0, 0), new Point3D(165, 330, 165), white));
            box1 = new RotateY(box1, 15);
            box1 = new Translate(box1, new Vec3(265, 0, 295));

            let box2 = /** @type {Hittable} */ (new AABox(new Point3D(0, 0, 0), new Point3D(165, 165, 165), white));
            box2 = new RotateY(box2, -18);
            box2 = new Translate(box2, new Vec3(130, 0, 65));

            world.add(new ConstantMedium(box1, 0.01, new Color(0, 0, 0)));
            world.add(new ConstantMedium(box2, 0.01, new Color(1, 1, 1)));
            break;
        }

        case 'book2final':
        case 'finalscene2': {
            const white = new Lambertian(new Color(0.73, 0.73, 0.73));
            const groundMat = new Lambertian(new Color(0.48, 0.83, 0.53));

            const boxes1 = new HittableList();
            const boxesPerSide = 20;
            for (let i = 0; i < boxesPerSide; i++) {
                for (let j = 0; j < boxesPerSide; j++) {
                    const w = 100.0;
                    const x0 = -1000.0 + i * w;
                    const z0 = -1000.0 + j * w;
                    const y0 = 0.0;
                    const x1 = x0 + w;
                    const y1 = randomDouble(1, 101);
                    const z1 = z0 + w;
                    boxes1.add(new AABox(new Point3D(x0, y0, z0), new Point3D(x1, y1, z1), groundMat));
                }
            }
            world.add(boxes1.buildAABBTree());

            const light = new DiffuseLight(new Color(7, 7, 7));
            world.add(new XZRect(123, 423, 147, 412, 554, light));

            const center1 = new Point3D(400, 400, 200);
            const center2 = center1.plus(new Vec3(30, 0, 0));
            world.add(new MovingSphere(center1, center2, 0, 1, 50, new Lambertian(new Color(0.7, 0.3, 0.1))));

            world.add(new Sphere(new Point3D(260, 150, 45), 50, new Dielectric(1.5)));
            world.add(new Sphere(new Point3D(0, 150, 145), 50, new Metal(new Color(0.8, 0.8, 0.9), 0.2)));

            const boundary = new Sphere(new Point3D(360, 150, 145), 70, new Dielectric(1.5));
            world.add(boundary);
            world.add(new ConstantMedium(boundary, 0.2, new Color(0.2, 0.4, 0.9)));

            const wholeMist = new Sphere(new Point3D(0, 0, 0), 5000, new Dielectric(1.5));
            world.add(new ConstantMedium(wholeMist, 0.0001, new Color(1, 1, 1)));

            world.add(new Sphere(new Point3D(400, 200, 400), 100, new Lambertian(new EarthTexture())));
            world.add(new Sphere(new Point3D(220, 280, 300), 80, new Lambertian(new NoiseTexture(0.1, 'marble'))));

            const boxes2 = new HittableList();
            const ns = 1000;
            for (let j = 0; j < ns; j++) {
                boxes2.add(new Sphere(Point3D.random(0, 165), 10, white));
            }
            let sphereCluster = /** @type {Hittable} */ (boxes2.buildAABBTree());
            sphereCluster = new RotateY(sphereCluster, 15);
            sphereCluster = new Translate(sphereCluster, new Vec3(-100, 270, 395));
            world.add(sphereCluster);
            break;
        }

        default:
            world.add(new Sphere(new Point3D(0, 0, -1), 0.5, new Lambertian(new Color(0.7, 0.3, 0.3))));
            world.add(new Sphere(new Point3D(0, -100.5, -1), 100, new Lambertian(new Color(0.8, 0.8, 0.0))));
            break;
    }

    return world;
}

/**
 * Returns default camera settings matching a preset scene.
 * @param {string} preset
 * @param {number} aspectRatio
 * @returns {CameraSpec}
 */
export function getDefaultCameraForPreset(preset, aspectRatio) {
    const p = preset.toLowerCase();
    if (p.startsWith('cornell')) {
        return {
            aspectRatio,
            lookfrom: new Point3D(278, 278, -800),
            lookat: new Point3D(278, 278, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 40,
            aperture: 0,
            focusDist: 10
        };
    }
    if (p === 'book2final' || p === 'finalscene2') {
        return {
            aspectRatio,
            lookfrom: new Point3D(478, 278, -600),
            lookat: new Point3D(278, 278, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 40,
            aperture: 0,
            focusDist: 10,
            time0: 0.0,
            time1: 1.0
        };
    }
    if (p === 'simplelight' || p === 'rectlight') {
        return {
            aspectRatio,
            lookfrom: new Point3D(26, 3, 6),
            lookat: new Point3D(0, 2, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 20,
            aperture: 0,
            focusDist: 10
        };
    }
    if (p === 'checker' || p === 'perlin' || p === 'bvh') {
        return {
            aspectRatio,
            lookfrom: new Point3D(13, 2, 3),
            lookat: new Point3D(0, 0, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 20,
            aperture: 0,
            focusDist: 10
        };
    }
    if (p === 'earth') {
        return {
            aspectRatio,
            lookfrom: new Point3D(0, 0, 12),
            lookat: new Point3D(0, 0, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 20,
            aperture: 0,
            focusDist: 12
        };
    }
    if (p === 'motionblur') {
        return {
            aspectRatio,
            lookfrom: new Point3D(0, 2, 8),
            lookat: new Point3D(0, 1, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 35,
            aperture: 0,
            focusDist: 8,
            time0: 0.0,
            time1: 1.0
        };
    }
    if (p === 'defocus' || p === 'dof') {
        return {
            aspectRatio,
            lookfrom: new Point3D(3, 3, 2),
            lookat: new Point3D(0, 0, -1),
            vup: new Vec3(0, 1, 0),
            vfov: 25,
            aperture: 0.4,
            focusDist: 5
        };
    }
    if (p === 'sphere' || p === 'single-sphere' || p === 'bluesphere' || p === 'redsphere') {
        return {
            aspectRatio,
            lookfrom: new Point3D(0, 0, 0),
            lookat: new Point3D(0, 0, -1),
            vup: new Vec3(0, 1, 0),
            vfov: 60,
            aperture: 0,
            focusDist: 1
        };
    }
    if (p === 'camera' || p === 'randomscene') {
        return {
            lookfrom: new Point3D(13, 2, 3),
            lookat: new Point3D(0, 0, 0),
            vup: new Vec3(0, 1, 0),
            vfov: 20,
            aspectRatio,
            aperture: 0.2,
            focusDist: 10
        };
    }
    if (p === 'dielectric') {
        const lookfrom = new Point3D(-2, 2, 1);
        const lookat = new Point3D(0, 0, -1);
        return {
            lookfrom,
            lookat,
            vup: new Vec3(0, 1, 0),
            vfov: 45,
            aspectRatio,
            aperture: 0,
            focusDist: lookfrom.minus(lookat).length()
        };
    }
    return {
        aspectRatio,
        lookfrom: new Point3D(0, 0, 0),
        lookat: new Point3D(0, 0, -1),
        vup: new Vec3(0, 1, 0),
        vfov: 90,
        aperture: 0,
        focusDist: 1
    };
}

// ----------------------------------------------------------------------------
// Progressive Render Patterns & Generators
// ----------------------------------------------------------------------------

/**
 * Partitions the image into a grid of rectangular sub-boxes and invokes a callback.
 * @param {number} numCols
 * @param {number} numRows
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @param {function(number, number, number, number): void} callback
 */
export function divImage(numCols, numRows, imageWidth, imageHeight, callback) {
    if (imageWidth < numCols) numCols = imageWidth;
    if (imageHeight < numRows) numRows = imageHeight;

    const boxWidth = Math.ceil(imageWidth / numCols);
    const boxHeight = Math.ceil(imageHeight / numRows);

    for (let y = 0; y < imageHeight; y += boxHeight) {
        for (let x = 0; x < imageWidth; x += boxWidth) {
            let left = x;
            let right = Math.min(x + boxWidth - 1, imageWidth - 1);
            let top = y;
            let bottom = Math.min(y + boxHeight - 1, imageHeight - 1);

            if (left > right) [left, right] = [right, left];
            if (top > bottom) [top, bottom] = [bottom, top];

            callback(left, right, top, bottom);
        }
    }
}

/**
 * Helper to construct a typed 2D pixel coordinate tuple.
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
function pt2(x, y) {
    return [x, y];
}

/**
 * Generator that yields pixels sequentially across a rectangular box.
 * @param {number} left
 * @param {number} right
 * @param {number} top
 * @param {number} bottom
 * @param {boolean} [leftToRight=true]
 * @param {boolean} [topToBottom=true]
 * @param {boolean} [rowMajor=true]
 * @yields {[number, number]}
 */
export function* iterBox(left, right, top, bottom, leftToRight = true, topToBottom = true, rowMajor = true) {
    const [colStart, colEnd, colDelta] = leftToRight ? [left, right + 1, 1] : [right, left - 1, -1];
    const [rowStart, rowEnd, rowDelta] = topToBottom ? [top, bottom + 1, 1] : [bottom, top - 1, -1];

    if (rowMajor) {
        for (let row = rowStart; row !== rowEnd; row += rowDelta) {
            for (let col = colStart; col !== colEnd; col += colDelta) {
                yield pt2(col, row);
            }
        }
    } else {
        for (let col = colStart; col !== colEnd; col += colDelta) {
            for (let row = rowStart; row !== rowEnd; row += rowDelta) {
                yield pt2(col, row);
            }
        }
    }
}

/**
 * Higher-order generator constructor for box iterations.
 * @param {boolean} [leftToRight=true]
 * @param {boolean} [topToBottom=true]
 * @param {boolean} [rowMajor=true]
 * @returns {function(number, number, number, number): Generator<[number, number]>}
 */
export function iterBoxGen(leftToRight = true, topToBottom = true, rowMajor = true) {
    return function(left, right, top, bottom) {
        return iterBox(left, right, top, bottom, leftToRight, topToBottom, rowMajor);
    };
}

/**
 * Generator that spirals inwards from box perimeter to center.
 * @param {number} left
 * @param {number} right
 * @param {number} top
 * @param {number} bottom
 * @yields {[number, number]}
 */
export function* pointsFromOutsideIn(left, right, top, bottom) {
    let curLeft = left;
    let curRight = right;
    let curTop = top;
    let curBottom = bottom;

    while (curLeft <= curRight && curTop <= curBottom) {
        for (let x = curLeft; x <= curRight; x++) {
            yield pt2(x, curBottom);
        }
        curBottom--;
        if (curTop > curBottom) break;

        for (let y = curBottom; y >= curTop; y--) {
            yield pt2(curRight, y);
        }
        curRight--;
        if (curLeft > curRight) break;

        for (let x = curRight; x >= curLeft; x--) {
            yield pt2(x, curTop);
        }
        curTop++;
        if (curTop > curBottom) break;

        for (let y = curTop; y <= curBottom; y++) {
            yield pt2(curLeft, y);
        }
        curLeft++;
    }
}

/**
 * Generator that yields points within a box in randomized order.
 * @param {number} left
 * @param {number} right
 * @param {number} top
 * @param {number} bottom
 * @yields {[number, number]}
 */
export function* randomPointsInBox(left, right, top, bottom) {
    /** @type {[number, number][]} */
    const points = [];
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            points.push(pt2(x, y));
        }
    }

    while (points.length > 0) {
        const i = randomInt(0, points.length - 1);
        const pt = points[i];
        const last = points.pop();
        if (i < points.length && last) {
            points[i] = last;
        }
        yield pt;
    }
}

/**
 * Creates a tiled multi-box progressive render generator.
 * @param {number} numRows
 * @param {number} numCols
 * @param {function(number, number, number, number): Generator<[number, number]>} genTemplate
 * @returns {function(number, number): Generator<[number, number][]>}
 */
export function boxesPattern(numRows, numCols, genTemplate) {
    return function* (imageWidth, imageHeight) {
        /** @type {Generator<[number, number]>[]} */
        const renderGens = [];

        divImage(numCols, numRows, imageWidth, imageHeight, (left, right, top, bottom) => {
            renderGens.push(genTemplate(left, right, top, bottom));
        });

        while (renderGens.length > 0) {
            /** @type {[number, number][]} */
            const yieldPoints = [];
            let i = 0;
            while (i < renderGens.length) {
                const ret = renderGens[i].next();
                if (ret.done) {
                    renderGens.splice(i, 1);
                    continue;
                }
                yieldPoints.push(ret.value);
                i++;
            }
            yield yieldPoints;
        }
    };
}

/**
 * Parses renderPattern configuration into a concrete generator function.
 * @param {RenderPatternSpec | null | undefined} renderPatternSpec
 * @returns {function(number, number): Generator<[number, number][]>}
 */
export function resolveRenderPattern(renderPatternSpec) {
    if (!renderPatternSpec || typeof renderPatternSpec !== 'object') {
        return function* (imageWidth, imageHeight) {
            for (let x = 0; x < imageWidth; x++) {
                for (let y = 0; y < imageHeight; y++) {
                    yield [pt2(x, y)];
                }
            }
        };
    }

    let numRows = Math.max(1, renderPatternSpec.numRows || 1);
    let numCols = Math.max(1, renderPatternSpec.numCols || 1);
    let pattern = (renderPatternSpec.pattern || 'random-points').toLowerCase();

    if (pattern === 'random') {
        const patterns = ['random-points', 'outside-in', 'iter-box'];
        pattern = patterns[randomInt(0, patterns.length - 1)];
        if (pattern === 'iter-box') {
            const iterPatterns = [
                'left-up-row', 'right-up-row', 'left-down-row', 'right-down-row',
                'left-up-col', 'right-up-col', 'left-down-col', 'right-down-col'
            ];
            pattern = iterPatterns[randomInt(0, iterPatterns.length - 1)];
        }
    }

    switch (pattern) {
        case 'random-points':
            return boxesPattern(numRows, numCols, randomPointsInBox);
        case 'outside-in':
            return boxesPattern(numRows, numCols, pointsFromOutsideIn);
        case 'left-up-row':
        case 'right-up-row':
        case 'left-down-row':
        case 'right-down-row':
        case 'left-up-col':
        case 'right-up-col':
        case 'left-down-col':
        case 'right-down-col': {
            const toRight = pattern.includes('right');
            const toBottom = pattern.includes('down');
            const rowMajor = pattern.includes('row');
            return boxesPattern(numRows, numCols, iterBoxGen(toRight, toBottom, rowMajor));
        }
        default:
            return boxesPattern(numRows, numCols, randomPointsInBox);
    }
}

// ----------------------------------------------------------------------------
// Core Shading & Ray Tracing Routine
// ----------------------------------------------------------------------------

/**
 * Computes color along a ray by testing intersections and evaluating material bounces in a path tracer.
 * @param {Ray} ray
 * @param {Hittable} world
 * @param {number} depth Remaining bounce recursion depth.
 * @param {'shaded'|'normals'} [mode='shaded'] Shading mode.
 * @param {'sky'|'black'|'white'|string|ColorLike} [background='sky'] Background appearance.
 * @param {number} [hitMin=0.00001] Minimum ray hit parameter to prevent self-intersection acne.
 * @param {{rayBounces: number, raysTraced: number} | null} [stats=null] Optional tracking statistics.
 * @returns {Color}
 */
export function rayColor(
    ray,
    world,
    depth,
    mode = 'shaded',
    background = 'sky',
    hitMin = 0.00001,
    stats = null
) {
    if (depth <= 0) {
        return BLACK.copy();
    }

    const hitRecord = new HitRecord();
    if (world.hitBy(ray, hitMin, INFINITY, hitRecord)) {
        if (!hitRecord.p || !hitRecord.normal || !hitRecord.material) {
            return BLACK.copy();
        }

        if (mode === 'normals' || hitRecord.material instanceof NormalMaterial) {
            return hitRecord.normal.plusNum(1.0).timesNum(0.5);
        }

        let emittedColor = BLACK.copy();
        if (typeof /** @type {any} */ (hitRecord.material).emitted === 'function') {
            emittedColor = /** @type {any} */ (hitRecord.material).emitted(ray, hitRecord);
        }

        if (typeof hitRecord.material.scatter === 'function') {
            if (hitRecord.material.scatter(ray, hitRecord) && hitRecord.material.scattered) {
                if (stats) {
                    stats.rayBounces++;
                    stats.raysTraced++;
                }
                const scatteredRay = hitRecord.material.scattered;
                const attenuation = (hitRecord.material.attenuation || WHITE).copy();
                const bounced = attenuation.times(rayColor(
                    scatteredRay,
                    world,
                    depth - 1,
                    mode,
                    background,
                    hitMin,
                    stats
                ));
                return emittedColor.plus(bounced);
            }
            return emittedColor;
        }

        const target = hitRecord.p.plus(hitRecord.normal).plus(randomUnitVector());
        if (stats) {
            stats.rayBounces++;
            stats.raysTraced++;
        }
        const bounced = rayColor(
            new Ray(hitRecord.p, target.minus(hitRecord.p), ray.time),
            world,
            depth - 1,
            mode,
            background,
            hitMin,
            stats
        ).timesNum(0.5);
        return emittedColor.plus(bounced);
    }

    if (background === 'black') {
        return BLACK.copy();
    }
    if (background === 'white') {
        return WHITE.copy();
    }
    if (background !== 'sky') {
        return parseColor(background, BLACK);
    }

    const unitDirection = ray.direction.unitVector();
    const t = 0.5 * (unitDirection.y + 1.0);
    return WHITE.timesNum(1.0 - t).plus((new Color(0.5, 0.7, 1.0)).timesNum(t));
}

/**
 * Main execution function for the raytracer.
 * Iterates through pixels, computes antialiased radiance, and streams batches via onProgress callback.
 * 
 * @param {RaytracerOptions} [options={}]
 * @param {function(ProgressPayload): void} [onProgress]
 * @returns {Promise<void>}
 */
export async function render(options = {}, onProgress) {
    const ASPECT_RATIO = options.aspectRatio ?? (16.0 / 9.0);
    const IMAGE_WIDTH = Math.round(options.imageWidth ?? 400);
    const IMAGE_HEIGHT = Math.round(options.imageHeight ?? (IMAGE_WIDTH / ASPECT_RATIO));
    const SAMPLES_PER_PIXEL = Math.max(1, options.samplesPerPixel ?? 50);
    const MAX_DEPTH = Math.max(1, options.maxDepth ?? 50);
    const aaJitter = options.aaJitter ?? true;
    const mode = options.mode === 'normals' ? 'normals' : 'shaded';
    const gamma = options.gamma ?? 2.0;
    const hitMin = typeof options.hitMin === 'number' ? options.hitMin : 0.00001;
    const updateInterval = Math.max(1, options.updateInterval ?? 10);

    const stats = {
        rayBounces: 0,
        raysTraced: 0,
    };

    if (options.diffuseMethod) {
        Lambertian.defaultDiffuseMethod = options.diffuseMethod;
    } else {
        Lambertian.defaultDiffuseMethod = 'lambertian';
    }

    const sceneSpec = options.scene ?? 'diffuse';
    let world = createWorld(sceneSpec, options);

    // Ensure all asynchronous image textures (such as EarthTexture) are fully fetched and decoded
    await ImageTexture.waitForAll();

    let defaultBg = 'sky';
    const lowerScene = typeof sceneSpec === 'string' ? sceneSpec.toLowerCase() : '';
    if (lowerScene.startsWith('cornell') || lowerScene.startsWith('simplelight') || lowerScene.startsWith('rectlight') || lowerScene.startsWith('book2final') || lowerScene.startsWith('finalscene2')) {
        defaultBg = 'black';
    }
    const background = options.background ?? defaultBg;

    if (options.aabb) {
        world = world.buildAABBTree();
    }

    const baseCameraSpec = options.camera || (typeof sceneSpec === 'string' ? getDefaultCameraForPreset(sceneSpec, ASPECT_RATIO) : { aspectRatio: ASPECT_RATIO });
    const cameraSpec = { ...baseCameraSpec };
    cameraSpec.aspectRatio = ASPECT_RATIO;
    if (typeof options.vfov === 'number') cameraSpec.vfov = options.vfov;
    if (typeof options.aperture === 'number') cameraSpec.aperture = options.aperture;
    if (typeof options.focusDist === 'number') cameraSpec.focusDist = options.focusDist;
    if (typeof options.time0 === 'number') cameraSpec.time0 = options.time0;
    if (typeof options.time1 === 'number') cameraSpec.time1 = options.time1;
    const camera = new Camera(cameraSpec);

    const patternGen = resolveRenderPattern(options.renderPattern)(IMAGE_WIDTH, IMAGE_HEIGHT);

    /** @type {RenderedPixel[]} */
    const newlyRenderedPixels = [];

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    function writePixel(x, y, r, g, b) {
        newlyRenderedPixels.push([x, y, [r, g, b]]);
    }

    /**
     * @param {number} x
     * @param {number} y
     */
    function renderPixel(x, y) {
        const pixelColor = new Color(0, 0, 0);

        const maxW = Math.max(1, IMAGE_WIDTH - 1);
        const maxH = Math.max(1, IMAGE_HEIGHT - 1);

        for (let s = 0; s < SAMPLES_PER_PIXEL; ++s) {
            const jitterX = (aaJitter && SAMPLES_PER_PIXEL > 1) ? randomDouble(0, 1.0) : 0.5;
            const jitterY = (aaJitter && SAMPLES_PER_PIXEL > 1) ? randomDouble(0, 1.0) : 0.5;
            const u = (x + jitterX) / maxW;
            const v = (y + jitterY) / maxH;
            const r = camera.getRay(u, v);
            stats.raysTraced++;
            pixelColor.plusEq(rayColor(
                r,
                world,
                MAX_DEPTH,
                mode,
                background,
                hitMin,
                stats
            ));
        }

        const scale = 1.0 / SAMPLES_PER_PIXEL;
        let r = pixelColor.r * scale;
        let g = pixelColor.g * scale;
        let b = pixelColor.b * scale;

        // Guard against NaN
        if (Number.isNaN(r)) r = 0.0;
        if (Number.isNaN(g)) g = 0.0;
        if (Number.isNaN(b)) b = 0.0;

        if (gamma === 2.0) {
            r = Math.sqrt(Math.max(0, r));
            g = Math.sqrt(Math.max(0, g));
            b = Math.sqrt(Math.max(0, b));
        } else if (gamma > 1.0) {
            const invGamma = 1.0 / gamma;
            r = Math.pow(Math.max(0, r), invGamma);
            g = Math.pow(Math.max(0, g), invGamma);
            b = Math.pow(Math.max(0, b), invGamma);
        }

        const outR = Math.floor(256 * clamp(r, 0.0, 0.999));
        const outG = Math.floor(256 * clamp(g, 0.0, 0.999));
        const outB = Math.floor(256 * clamp(b, 0.0, 0.999));

        writePixel(x, y, outR, outG, outB);
    }

    /**
     * @param {boolean} [isDone=false]
     */
    function flush(isDone = false) {
        if (typeof onProgress === 'function') {
            onProgress([
                [IMAGE_WIDTH, IMAGE_HEIGHT],
                [...newlyRenderedPixels],
                isDone,
                {
                    rayBounces: stats.rayBounces,
                    raysTraced: stats.raysTraced,
                }
            ]);
        }
        newlyRenderedPixels.length = 0;
    }

    let batchCount = 0;

    while (true) {
        const ret = patternGen.next();
        if (ret.done) {
            flush(true);
            break;
        }

        const pixels = ret.value;
        for (const [x, y] of pixels) {
            if (inBox(x, y, 0, IMAGE_WIDTH - 1, 0, IMAGE_HEIGHT - 1)) {
                renderPixel(x, y);
            }
        }

        batchCount++;
        if (batchCount >= updateInterval || newlyRenderedPixels.length >= 64) {
            flush(false);
            batchCount = 0;
        }
    }
}

// ----------------------------------------------------------------------------
// Web Worker Environment Binding
// ----------------------------------------------------------------------------

if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.onmessage = (event) => {
        const options = (event && event.data) ? event.data : {};
        render(options, (progressData) => {
            self.postMessage(progressData);
        });
    };
}

