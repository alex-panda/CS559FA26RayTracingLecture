
<!-- .slide: class="title-slide" -->

<div class="lecture-badge">CS 559: Computer Graphics &bull; UW-Madison</div>

# Ray Tracing

<img class="title-crest" src="images/uw-crest-color-web-digital.png" alt="UW Crest" />

<div class="title-meta">
  <strong>Department of Computer Sciences</strong><br>
  University of Wisconsin&ndash;Madison
</div>

<!-- ---

## Lesson Plan

 - What are we looking for?
 - How is ray tracing used? -->

---

## What is Rendering?

Generating a 2D image from a model of a scene.

For the image, we must think about:
 - 3D geometry
 - camera
 - lights
 - textures
 - materials
 - and more

We typically want *high quality* image creation.

We care a lot about light and the phenomena it causes.

---

## Real-World Phenomena: Hard Shadows

<!-- Severe contrast in where the light does and does not hit. -->

![Hard Shadows IRL](images/lighting/hard_shadow/michael-loftus-yhNWe_rEvqk-unsplash.jpg) ![Hard Shadows IRL](images/lighting/hard_shadow/lukas-lehotsky-eeOfHstLXdc-unsplash.jpg)

--

## Real-World Phenomena: Hard Shadows

<iframe src="https://threejs.org/examples/webgl_lights_physical"></iframe>

---

## Real-World Phenomena: Soft Shadows

<!-- A gradience in the intensity of the light. -->

![Soft Shadows From Light](images/lighting/soft_shadow/lena-polishko-IU2IWJHMRzA-unsplash.jpg)
![Soft Shadows From Light](images/lighting/soft_shadow/brandon-salabarria-d6Xm0kCm0cI-unsplash.jpg)

--

## Real-World Phenomena: Soft Shadows

<iframe src="https://threejs.org/examples/webgpu_lightmap_baking"></iframe>
<!-- <iframe src="https://threejs.org/examples/webgpu_lightprobes_complex"></iframe> -->

---

## Real-World Phenomena: Reflections

<!-- <div class="cols-2">
<div class="col">
    <img src="images/lighting/reflection/andre-mouton-GBEHjsPQbEQ-unsplash.jpg" />
    <img src="images/28-Raytracing/page_007_image_001.jpeg" />
</div>
<div class="col">
    <img src="images/lighting/reflection/patrick-von-der-wehd-WVTlB9gTlsk-unsplash.jpg" />
</div>
</div> -->

<div class="cols-3">
    <img src="images/lighting/reflection/andre-mouton-GBEHjsPQbEQ-unsplash.jpg" />
    <img src="images/lighting/reflection/patrick-von-der-wehd-WVTlB9gTlsk-unsplash.jpg" />
    <img src="images/28-Raytracing/page_007_image_001.jpeg" />
</div>

--

## Real-World Phenomena: Reflections

<iframe src="https://threejs.org/examples/webgl_loader_texture_ultrahdr"></iframe>

---

## Real-World Phenomena: Transparency

![](images/lighting/transparency/daniel-sessler-I_-OwWnUw6w-unsplash.jpg)
![](images/lighting/reflection/gavyn-alejandro-QZxCsL-tL60-unsplash.jpg)

--

## Real-World Phenomena: Transparency

<iframe src="https://threejs.org/examples/webgpu_oit"></iframe>

---

## Real-World Phenomena: Refraction

<div class="cols-2">
<div class="col">

<img src="images/lighting/refraction/Refraction_photo.png" />
<img src="images/lighting/refraction/hannah-murrell-pTfdcT0hxGc-unsplash.jpg" />

</div>
<div class="col">

![](images/lighting/refraction/klara-kulikova-9Er77sbYb3A-unsplash.jpg)

</div>
</div>

--

## Real-World Phenomena: Refraction

<iframe src="https://threejs.org/examples/webgl_loader_gltf_transmission"></iframe>

---

## Real-World Phenomena: Caustics & Dispersion

<!-- <div class="cols-2">
    <div class="col">
        <img src="images/lighting/caustics/pexels-magda-ehlers-pexels-4198437.jpg" />
    </div>
    <div class="col">
        <img src="images/lighting/dispersion/pexels-design-bits-119509-3845162.jpg" />
        <img src="images/28-Raytracing/page_009_image_001.jpeg" />
    </div>
</div> -->

![](images/lighting/caustics/pexels-magda-ehlers-pexels-4198437.jpg)
![](images/lighting/dispersion/pexels-design-bits-119509-3845162.jpg)
![](images/28-Raytracing/page_009_image_001.jpeg)

--

## Real-World Phenomena: Caustics & Dispersion

<iframe src="https://threejs.org/examples/webgpu_volume_caustics.html"></iframe>

--

## Real-World Phenomena: Dispersion

<iframe src="https://threejs.org/examples/webgl_loader_gltf_dispersion"></iframe>

---

## Real-World Phenomena: Subsurface Scattering

![](images/lighting/subsurface_scattering/diane-picchiottino-Fo4_-oKnxjE-unsplash.jpg)
![](images/lighting/subsurface_scattering/subsurface_scattering_semi_open_hand.jfif)
![](images/lighting/subsurface_scattering/subsurface_scattering.jfif)

--

## Real-World Phenomena: Subsurface Scattering

<iframe src="https://threejs.org/examples/webgpu_materials_sss.html"></iframe>

---

## Real-World Phenomena: Sunbeams

![](images/lighting/sunbeams/greg-jenkins-TdMtmn7t19g-unsplash.jpg)
![](images/lighting/sunbeams/rolf-schmidbauer-lT9im5ngwdE-unsplash.jpg)

--

## Real-World Phenomena: Sunbeams

<iframe src="https://threejs.org/examples/webgpu_postprocessing_godrays.html"></iframe>

---

## Global Illumination: Color Bleed

![](images/lighting/color_bleed/simple_color_bleeding.png)
![](images/28-Raytracing/page_011_image_001.jpeg)

--

## Global Illumination: Color Bleed

<iframe src="https://threejs.org/examples/webgpu_lightprobes"></iframe>

---

## Camera Effects: Depth of Field & Lens Flare & Bloom

<!-- ![](images/camera/depth_of_field/jorge-salvador-IyaYK3NPCac-unsplash.jpg) -->
![](images/camera/depth_of_field/firdaus-yusoff-JoI6RxckDAo-unsplash.jpg)
![](images/camera/lens_flare/nexus-6-bk9bd03OhJw-unsplash.jpg)

--

## Camera Effects: Lens Flare & Bloom

<iframe src="https://threejs.org/examples/webgpu_postprocessing_lensflare.html"></iframe>

---

## Model-Centric Rendering (Rasterization)

<div class="cols-2 cols-2-1">
<div class="col">

"For each triangle, find which pixels it covers."

Pros:
 - fast (easy to parallelize)
 - great standardization ("Oops! All triangles!")
 - can "fake" simpler lighting effects using hacks

Cons:
 - cannot natively do many advanced effects
 - several effects are difficult to achieve
 - realism is an art

</div>
<div class="col">

![](images/rasterization/triangle_rasterization_cover.svg)

![](images/rasterization/triangle_rasterization_draw.svg)

</div>
</div>

--

## Model-Centric Rendering (Rasterization)

<iframe src="https://threejs.org/examples/webgl_postprocessing_taa"></iframe>

--

## Model-Centric Rendering (Rasterization)

<iframe src="https://threejs.org/examples/webgpu_lines_fat_wireframe"></iframe>

---

## Light-Centric Rendering (Ray Tracing)

"For each pixel, calculate how light rays reach it."

Pros:
 - intuitive: for realistic lighting, simulate light realistically
 - advanced lighting effects become easy
 - most problems have a simple solution: more light rays
 <!-- - the math *can* be simple -->

Cons:
 - computationally expensive
 - difficult to parrallelize (recursive bounces must be done sequentially)
 - each ray must know the full scene

---

## How Computationally Expensive?

<div style="font-size: 0.9em;">

<p style="height: 1em;"></p>

(1000 by 1000 image) &times; (1 ray per pixel) = 1,000,000 rays

<p style="height: 1em;"></p>

1,000,000 rays &times; 1000 object hit tests per ray = at least 1,000,000,000 operations

</div>

<iframe src="demo/count_to_1_000_000_000/index.html"></iframe>

Verdict: optimize, optimize, optimize, tradeoff

<!-- --- -->

<!-- .slide_: class="subtitle-slide" -->

<!-- # Is Ray Tracing Used? -->

---

## Ray Tracing In Video Games

<p style="height:1em;"></p>

<div style="font-size: 0.90em;">

| Newer Game                     | Path Tracing Use                                        |
| ------------------------------ | ------------------------------------------------------- |
| Cyberpunk 2077: Overdrive Mode | Full ray tracing / path-traced lighting approach        |
| Alan Wake 2                    | Full ray tracing with DLSS 3.5 and Ray Reconstruction   |
| 007 First Light                | Path-traced effects and DLSS 4.5 Support                |

</div>

<p style="height:0.5em;"></p>

<div style="font-size: 0.90em;">

| Older Game (Retrofitted)       | Path Tracing Use                                        |
| ------------------------------ | ------------------------------------------------------- |
| Minecraft Bedrock              | Full ray tracing / path-traced lighting available       |
| Portal with RTX                | RTX Remix path-traced lighting showcase                 |
| Half-Life 2 RTX                | RTX Remix path-traced visual upgrade project            |

</div>

---

## Ray Tracing vs Path Tracing

Path-tracing is more extensive ray tracing.

<div class="cols-2">
<div class="col">

### Ray Tracing

Can suppliment rasterization methods.

Typically scoped to solving targeted lighting effects: soft shadows, reflections, ambient occlusion, and more.

Can be scoped to only allow so many bounces/rays at once.

</div>
<div class="col">

### Path Tracing

Trace the full path of each ray until it either hits a light or runs out of energy.

<a href="https://box.co.uk/blog/path-tracing-vs-ray-tracing" target="_blank">
    <img src="images/Ray-Tracing-Path-Tracing-What-Difference-1.webp" />
</a>

</div>
</div>

---

## Ray Tracing in Video Games: Minecraft

<!-- <p style="height:1em;"></p> -->

<div class="center-h cols-2">

<div class="col">
Without Ray Tracing

<a href="https://learn.microsoft.com/en-us/minecraft/creator/documents/rtxgettingstarted?view=minecraft-bedrock-stable">
    <img src="images/ray_tracing_use_examples/minecraft_ray_tracing_no.jpg" />
</a>
</div>

<div class="col">
With Ray Tracing
<a href="https://learn.microsoft.com/en-us/minecraft/creator/documents/rtxgettingstarted?view=minecraft-bedrock-stable">
    <img href="https://learn.microsoft.com/en-us/minecraft/creator/documents/rtxgettingstarted?view=minecraft-bedrock-stable" src="images/ray_tracing_use_examples/minecraft_ray_tracing_yes.jpg" />
</a>
</div>

</div>

With ray tracing we see: Ambient light, Ambient occlusion, Color bleeding, Better Transparency, Reflections

---

## Ray Tracing In Games: Cyberpunk 2077 (Ambient Lighting)

<a href="https://www.youtube.com/watch?v=1Xe4Z5uU_J0" target="_blank">
    <img src="images/ray_tracing_use_examples/cyberpunk2077_raytrace_comparison.PNG" />
</a>

---

## Ray Tracing In Games: Cyberpunk 2077 (Amb. Occlusion)

<a href="https://www.youtube.com/watch?v=1Xe4Z5uU_J0" target="_blank">
    <img src="images/ray_tracing_use_examples/cyberpunk2077_raytrace_comparison5.PNG" />
</a>

---

## Ray Tracing In Games: Cyberpunk 2077 (Reflections)

<a href="https://www.youtube.com/watch?v=1Xe4Z5uU_J0" target="_blank">
    <img src="images/ray_tracing_use_examples/cyberpunk2077_raytrace_comparison7.PNG" />
</a>

---

## Ray Tracing In Games: Cyberpunk 2077 (Sunbeams/Bloom)

<a href="https://www.youtube.com/watch?v=1Xe4Z5uU_J0" target="_blank">
    <img src="images/ray_tracing_use_examples/cyberpunk2077_raytrace_comparison3.PNG" />
</a>

---

## Ray Tracing In Movies

<p style="height:1em;"></p>

<div style="font-size: 0.90em;">

| Movie or Show                   | Examples of Ray/Path Tracing Use                            |
| ------------------------------- | ------------------------------------------------------- |
| Toy Story (1995)                | Color bleeding, realistic skin & plastic & water        |
| Transformers (2007)             | Ambient lighting, reflections                           |
| Avatar: The Way of Water (2023) | Water reflections/transparency, subsurface scattering   |
| Elemental (2023)                | Built entirely on path-tracing pipelines                |
| The Mandalorian (2019-2023)     | Used to inform Real-World RGB volumes that shine light on the actor's face |

</div>

---

## Avatar: The Way of Water (Subsurface Scattering)

<div class="center-vh">
<a href="https://james-camerons-avatar.fandom.com/wiki/Avatar:_The_Way_of_Water" target="_blank" style="height: 100%;">
    <img src="images/ray_tracing_use_examples/avatar_way_of_water_translucency.webp" style="height: 100%;" />
</a>
</div>

---

## Transformers (Ambient Lighting, Reflections)

<div class="center-vh">
<a href="https://www.awn.com/vfxworld/transformers-ratcheting-hard-body-surfaces#:~:text=When%20exec%20producer%20Steven%20Spielberg%20gave%20the,51%20pieces%2C%20the%20movie%20version%20has%2010%2C108." target="_blank" style="height: 100%;">
    <img src="images/ray_tracing_use_examples/transformers_ray_tracing.gif" style="height: 100%;" />
</a>
</div>

---

## Other Uses Of Ray Tracing

<div style="font-size: 0.95em;">

 - Optical Engineering and Lens Design
   - Before a physical camera lens, microscope, telescope, or smartphone camera sensor is manufactured, engineers use ray tracing software (such as Zemax or Code V) to model it.

 - Architecture and Solar Energy Design
   - Architects and urban planners rely heavily on ray tracing simulations to design buildings. Particularly useful for figuring out window placement, shading structures, optimizing natural daylight, preventing blinding glare.

 - Acoustics and Sound Design
   - Sound travels as pressure waves, but high-frequency audio waves behave similarly to light particles. Sound waves bounce off walls, absorb into soft materials, and wrapp around corners.

</div>

---

## The Mandalorian (Ray Tracing To Determine Real Lighting)

<div class="cols-2">
<a href="https://www.youtube.com/watch?v=gUnxzVOs3rk" target="_blank">
    <img src="images/ray_tracing_use_examples/mandalorian_cgi.PNG" />
</a>
<a href="https://www.youtube.com/watch?v=gUnxzVOs3rk" target="_blank">
    <img src="images/ray_tracing_use_examples/mandalorian_led_stage.PNG" />
</a>
</div>

<div class="cols-2">
<a href="https://www.youtube.com/watch?v=gUnxzVOs3rk" target="_blank">
    <img src="images/ray_tracing_use_examples/mandalorian_led_stage_on_set.PNG" />
</a>
<a href="https://www.youtube.com/watch?v=gUnxzVOs3rk" target="_blank">
    <img src="images/ray_tracing_use_examples/mandalorian_led_stage_on_set_filming.PNG" />
</a>
</div>

---

## Is Ray Tracing Accessible? Yes! THREE supports ray tracing.

<iframe src="https://erichlof.github.io/THREE.js-PathTracing-Renderer/Geometry_Showcase.html"></iframe>

---

## Do you need great hardware to do ray tracing?

No! You can ray-trace on your calculator.

<!-- <p style="height: 1em;"></p> -->

<div style="height: 75%; display: flex; justify-content: center;">
<video controls autoplay muted loop playsinline style="height: 100%;">
  <source src="videos/ray_tracer_TI84_Plus_CE.webm" type="video/webm">
</video>
</div>

<a class="small_link" href="https://www.youtube.com/watch?v=rY413t5fArw">https://www.youtube.com/watch?v=rY413t5fArw</a>

---

## Nature's Algorithm ("Forward" Ray Tracing)

<!-- Light Source -> Light Rays In All Directions -> (Object Bounces)* -> Camera -->

<iframe src="demo/forwards_ray_tracing2D/index.html"></iframe>

---

## The Issue With Forward Ray Tracing

<p style="height: 1em;"></p>

Not all rays reach the camera.

<p style="height: 1em;"></p>

In real life, this is fine, but
 - we want an image
 - we want to generate our image quickly
 - rays not included in our final image are wasted work

---

## The Issue With Forward Ray Tracing: Sampling

The fundamental problem: we are *sampling* the total number of rays.

<p style="height: 1em"></p>

But simulating $10^{19}$ rays per second per light source is infeasible.

<p style="height: 1em"></p>

If we want good performance, we must continue to sample.

<p style="height: 1em"></p>

The solution:
 - sample smarter, not harder
 - only trace the rays that reach the camera
 <!-- - send rays from the camera to the rest of the scene -->

---

## "Forward" Ray Tracing

<iframe src="demo/forwards_ray_tracing2D/index.html"></iframe>

---

## How do we select only the rays that reach the camera?

<div class="cols-2">
<div class="col">

<p style="height: 1em"></p>

**Helmholtz Reciprocity:** Optical light paths are mathematically symmetric.

If a photon can travel along path
$$A \rightarrow B \rightarrow C$$
then it can travel along path
$$C \rightarrow B \rightarrow A$$

<!-- **If we can send a ray from the camera to a light,
then a ray could have been sent from the light to
the camera using the same path.** -->

</div>
<div class="col">

<img src="images/raytracing_backwards/forward_raytracing.png" style="width:100%;">

<img src="images/raytracing_backwards/backwards_raytracing.png" style="width:100%;">

</div>
</div>

---

## "Backward" Ray Tracing

<iframe src="demo/backwards_ray_tracing2D/index.html"></iframe>

---

## Ray Representation

<div style="font-size: 0.75em;">

Mathematically, a ray is a half-line starting at an origin and extending along a 3D direction vector:

<div class="cols-2">

<div>

$$\vec{P}(t) = \vec{A} + t \vec{b} \quad \text{for } t > 0$$

$\vec{A} = (A_x, A_y, A_z)$ is the **origin** (ray start point)

$\vec{b} = (b_x, b_y, b_z)$ is the **direction** (unit length)

$t \in \mathbf{R}$ is the **ray parameter**

<p style="height:0.5em;"></p>

"Move $t$ units in direction $\vec{b}$ starting from $\vec{A}$"

<p style="height:0.5em;"></p>

**Interpreting $t$**

$t$ is the distance we want to travel.

- $t < 0$: Move backwards (behind origin)
- $t = 0$: At origin
- $t > 0$: Move forwards (in direction)

</div>
<div>

**In JavaScript (`Ray` class):**

```javascript
class Ray {

  /**
   * @param {Vec3} origin
   * @param {Vec3} direction
   */
  constructor(origin, direction) {
    this.origin = origin;
    this.direction = direction;
  }

  /**
   * @param {number} t
   * @returns {Vec3}
   */
  at(t) {
    return this.origin.plus(this.direction.timesNum(t));
  }

}
```

</div>
</div>

</div>

---

## Camera

<div class="cols-2 cols-2-1">

<div class="col">

Map the pixels into 3D space for the viewpoint.

For Orthogonal Views:
 - Then send parrallel rays that are orthogonal to the pixel plane into the scene, each ray being from a pixel center.

For Perspective Views:
 -  Send the rays from the origin through each pixel center.

</div>

<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_orthographic_views.jpg" />
</a>

<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_perspective_views.jpg" />
</a>
</div>

</div>

---

## Camera (Orthographic)

<div class="cols-2 cols-2-1">

<div class="col" style="font-size: 0.70em;">

Rays are **parallel** and cast orthogonally into the scene:

**1. Camera Frame & View Direction**
- Viewpoint $\vec{e}$ and basis $(\vec{u}, \vec{v}, \vec{w})$ ($\vec{u}$ = right, $\vec{v}$ = up, $-\vec{w}$ = view direction)

**2. Image Plane Coordinates ($\vec{s}$)**
- Pixel $(i, j)$ in $n_x \times n_y$ grid with bounds $[l, r]$ and $[b, t]$:
  $u = l + (r - l)\frac{i + 0.5}{n_x}, \quad v = b + (t - b)\frac{j + 0.5}{n_y}$
- Pixel position on image plane: $\vec{s} = \vec{e} + u\vec{u} + v\vec{v}$

**3. Ray Equation $\vec{P}(t) = \vec{A} + t\vec{b}$**
- **Origin $\vec{A}$:** unique per pixel: $\vec{A} = \vec{s} = \vec{e} + u\vec{u} + v\vec{v}$
- **Direction $\vec{b}$:** constant for all rays: $\vec{b} = -\vec{w}$
- **Ray:** $\vec{P}(t) = (\vec{e} + u\vec{u} + v\vec{v}) + t(-\vec{w})$

</div>

<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_orthographic_views.jpg" />
</a>
</div>

</div>

---

## Camera (Perspective)

<div class="cols-2 cols-2-1">

<div class="col" style="font-size: 0.70em;">

Rays **diverge** from a single viewpoint (pinhole model):

**1. Camera Frame & Focal Distance**
- Viewpoint / camera eye $\vec{e}$ and basis $(\vec{u}, \vec{v}, \vec{w})$
- Image plane placed at focal distance $d$ along view direction $-\vec{w}$

**2. Target Pixel Position ($\vec{s}$)**
- Pixel $(i, j)$ maps to coordinates $(u, v)$ on image plane:
  $\vec{s} = \vec{e} + u\vec{u} + v\vec{v} - d\vec{w}$

**3. Ray Equation $\vec{P}(t) = \vec{A} + t\vec{b}$**
- **Origin $\vec{A}$** is the same for all rays (the eye):
  $\vec{A} = \vec{e}$
- **Direction $\vec{b}$** points from eye $\vec{e}$ through target $\vec{s}$:
  $\vec{b} = \frac{\vec{s} - \vec{e}}{\|\vec{s} - \vec{e}\|}$
- **Ray:** $\vec{P}(t) = \vec{e} + t\left(\frac{\vec{s} - \vec{e}}{\|\vec{s} - \vec{e}\|}\right)$

</div>

<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_perspective_views.jpg" />
</a>
</div>

</div>

<!-- ---

## Camera (Perspective View Visualized)

<video controls autoplay muted loop playsinline style="height: 100%;">
  <source src="videos/ray_tracing_camera_rays3D.webm" type="video/webm">
</video>

<a class="small_link" href="https://www.youtube.com/watch?v=Qz0KTGYJtUk">https://www.youtube.com/watch?v=Qz0KTGYJtUk</a> -->

---

## Ray-Sphere Intersection

<div class="cols-2 cols-2-1">

<div style="font-size: 0.63em;">

**Goal:** Determine if ray $\vec{P}(t) = \vec{A} + t\vec{b}$ hits sphere with center $\vec{C}$ and radius $R$.

<p style="height: 1em;"></p>

**1. Sphere Equation**

A point $\vec{P}$ is on the sphere if its distance from center $\vec{C}$ is $R$:

$$(\vec{P} - \vec{C}) \cdot (\vec{P} - \vec{C}) = R^2$$

**2. Three Geometric Cases**

Testing the ray against the sphere gives a quadratic with **discriminant $D$**:
- **Miss ($D < 0$):** 0 intersections (ray misses sphere entirely)
- **Tangent ($D = 0$):** 1 intersection (ray grazes surface at one point)
- **Secant ($D > 0$):** 2 intersections (ray enters at $t_1$ and exits at $t_2$)

<p style="height: 0.1em;"></p>

For ray tracing, we pick the **closest positive hit** in $[t_{\min}, t_{\max}]$.

</div>

<div>
<!-- <a href="https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-sphere-intersection.html">
    <img src="images/rayspherecases.png" />
</a> -->
<a href="https://raytracing.github.io/books/RayTracingInOneWeekend.html#rays,asimplecamera,andbackground/therayclass" style="height:100%;">
    <img src="images/fig-1.05-ray-sphere.jpg" style="height:100%;" />
</a>
</div>

</div>

</div>

---

## Ray-Sphere Intersection: Determine Hit Distance

<div class="cols-2">

<div class="col" style="font-size: 0.63em;">

**The Intersection Equation:**
$$a t^2 + 2h t + c = 0$$

Where $\vec{oc} = \vec{A} - \vec{C}$ (center to ray origin):
 - ray direction squared ($= 1$ if unit vector): **$a = \vec{b} \cdot \vec{b}$**
 - projection of $\vec{oc}$ along ray direction: **$h = \vec{oc} \cdot \vec{b}$**
 - distance to center squared minus $R^2$: **$c = (\vec{oc} \cdot \vec{oc}) - R^2$**

<p style="height: 0.2em;"></p>

**1. Discriminant: Did we hit?**
$$\text{discriminant} = h^2 - ac$$
- **$< 0$:** Ray misses sphere
- **$\ge 0$:** Ray hits sphere.

</div>

<div class="col" style="font-size: 0.63em;">

**2. Hit Distance ($t$):**
Solving the quadratic yields the hit distances along the ray:
$$t = \frac{-h \pm \sqrt{\text{discriminant}}}{a}$$

- **Entry point (smaller $t$):**
  $$t_{\text{entry}} = \frac{-h - \sqrt{\text{discriminant}}}{a}$$
- **Exit point (larger $t$):**
  $$t_{\text{exit}} = \frac{-h + \sqrt{\text{discriminant}}}{a}$$

<p style="height: 0.2em;"></p>

**3. Validity Check:**
Pick closest root in $[t_{\min}, t_{\max}]$. If neither fits, the hit is behind us or blocked.

</div>

</div>

---

## Ray Tracer (One Blue Sphere)

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=sphere&maxAntialiasingSubdivisions=0"></iframe>

--

## Ray Tracer (One Blue Sphere)

<img src="images/whitted_raytracer/ray_tracer_one_blue_sphere.PNG" />

---

## Ray Tracer (2D)

<iframe src="demo/backwards_ray_tracing2D/index.html?scene=%7B%22lights%22%3A%5B%5D%2C%22camera%22%3A%7B%22eye%22%3A%7B%22x%22%3A780%2C%22y%22%3A229%7D%2C%22lookat%22%3A%7B%22x%22%3A580%2C%22y%22%3A229%7D%7D%2C%22barriers%22%3A%5B%7B%22shape%22%3A%22sphere%22%2C%22p1%22%3A%7B%22x%22%3A437%2C%22y%22%3A234%7D%2C%22width%22%3A16%2C%22radius%22%3A67%2C%22material%22%3A%7B%22ambient%22%3A%5B0.10196078431372549%2C0.10196078431372549%2C0.10196078431372549%5D%2C%22diffuse%22%3A%5B0.20392156862745098%2C0.596078431372549%2C0.8588235294117647%5D%2C%22specular%22%3A%5B0.5019607843137255%2C0.5019607843137255%2C0.5019607843137255%5D%2C%22shininess%22%3A32%2C%22reflectivity%22%3A0%2C%22transparency%22%3A0%2C%22refractiveIndex%22%3A1.5%7D%7D%5D%7D&bounces=0"></iframe>

---

## Lighting: Ambient Light

<div style="font-size:0.85em;">

<p style="height: 1em;"></p>

**Why Ambient Light?**
- In real life, light bounces millions of times off walls and surfaces, filling spaces with indirect light.
- Simulating every indirect bounce is computationally expensive.
- **Approximation:** Add a baseline of light present everywhere in the scene.

<p style="height: 1em;"></p>

**Visual Consequence:**
- Surfaces are uniformly shaded with a flat, constant color.
- Produces a **flat 2D silhouette** without depth, curvature, or contact shadows.

</div>

---

## Ray Tracer (2D) With Ambient Light

<iframe src="demo/backwards_ray_tracing2D/index.html?scene=%7B%22lights%22%3A%5B%5D%2C%22camera%22%3A%7B%22eye%22%3A%7B%22x%22%3A780%2C%22y%22%3A229%7D%2C%22lookat%22%3A%7B%22x%22%3A580%2C%22y%22%3A229%7D%7D%2C%22barriers%22%3A%5B%7B%22p1%22%3A%7B%22x%22%3A492%2C%22y%22%3A289%7D%2C%22p2%22%3A%7B%22x%22%3A490%2C%22y%22%3A168%7D%2C%22color%22%3A%22%233498DB%22%2C%22opacity%22%3A1%7D%5D%7D&bounces=0&ambient=true&ambientColor=FFFFFF&lightColor=FFFFFF"></iframe>

---

## Ray Tracer With Ambient Light

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=sphere&adaptiveTolerance=5000&onHitAndBlack=52,152,219&maxAntialiasingSubdivisions=0"></iframe>

--

## Ray Tracer With Ambient Light

<img src="images/whitted_raytracer/ray_tracer_with_ambient_light.PNG" />

---

## John Turner Whitted & Whitted Ray Tracing

<div class="cols-2 cols-2-1">
<div class="col">

His 1980 paper solved:
 - rendering realistic mirror reflections
 - rendering transparent refraction
 - hard shadows

His key insight: recursion. When rays hit a surface they can spawn other rays.

</div>
<div class="col">
    <a href="https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-overview//light-transport-ray-tracing-whitted.html">
    <img src="images/rt-recursive.png">
    </a>
</div>
</div>

<a href="https://www.cs.drexel.edu/~david/Classes/Papers/p343-whitted.pdf" class="obvious_link">
    Whitted's Paper
</a>

---

## Whitted Ray Tracing: Hard Shadows Using Shadow Rays

<!-- <div class="cols-2 cols-2-1">
<div class="col" style="font-size: 0.9em;"> -->

The Basic Idea:
 - Send a light ray into the scene.
 - See if the ray hits an object (such as a sphere).
 - If the ray hits an object, send a ray from the intersection point to every light in the scene (these are *shadow rays* since they determine whether the point that spawned them is in view of a light source).
 - If a shadow ray hits a light before intersecting some other object, then forward light rays could reach the camera by using the same path but going in the opposite direction.

<p style="height: 1em;"></p>

Lights are modeled as points in space.

---

## Whitted Ray Tracing: Illumination Equation

<div class="cols-2">

<div class="col" style="font-size: 0.58em;">

**Whitted's Illumination Model**

<div style="text-align: center; scale: 1.25;">

$$I = I\_a + k\_d \sum\_{j=1}^{m} (\vec{N} \cdot \vec{L}\_j) + k\_s S + k\_t T$$

</div>

**The Variables**

<div style="line-height: 0em;">

**$I$**: Total reflected intensity (radiance/color) reaching the camera.

**$I\_a$**: Constant ambient illumination (baseline scene light).

**$k\_d$**: Diffuse reflection coefficient (surface color / albedo).

**$\vec{N}$**: Unit surface normal at the hit point.

**$\vec{L}\_j$**: Unit vector pointing toward the $j$-th point light source (out of $m$ total lights).

**$k\_s$**: Specular reflection coefficient.

**$S$**: Radiance incident from the mirror reflection direction $\vec{R}$.

**$k\_t$**: Transmission coefficient.

**$T$**: Radiance incident from the refraction direction (Snell's Law).

</div>

</div>

<div class="col" style="font-size: 0.55em;">

**The Phong Model (Purely Local)**

<div style="scale: 1.25;">

$$I = I\_a + k\_d \sum\_{j=1}^{m} (\vec{N} \cdot \vec{L}\_j) + k\_s \sum\_{j=1}^{m} (\vec{N}' \cdot \vec{L}\_j)^n$$

</div>

- **Isolated objects**: Phong only accounts for direct light from point light sources, adding a fake shiny highlight $(\vec{N}' \cdot \vec{L}\_j)^n$ rather than checking if the point is shadowed by other objects.
 - Key Point: **No inter-object interaction**. Objects could not reflect each other or refract light through glass.

<p style="font-size: 1em;"></p>

**Whitted's Innovation**

Whitted's model retains Phong's diffuse term ($k\_d \sum\_{j=1}^{m} (\vec{N} \cdot \vec{L}\_j)$), but replaces the empirical highlight ($k\_s \sum\_{j=1}^{m} (\vec{N}' \cdot \vec{L}\_j)^n$) with **$S$** (reflected ray) and adds **$T$** (a refracted ray) to query the entire 3D scene.

This change allows some forms of **global illumination**. Objects can shadow eachother, reflect eachother, and refract to show eachother.

</div>

</div>

---

## Ray Tracer (2D) With Shadow Rays

<iframe src="demo/backwards_ray_tracing2D/index.html?scene=%7B%22lights%22%3A%5B%7B%22x%22%3A764%2C%22y%22%3A393%2C%22color%22%3A%22%23FFFFFF%22%7D%5D%2C%22camera%22%3A%7B%22eye%22%3A%7B%22x%22%3A780%2C%22y%22%3A229%7D%2C%22lookat%22%3A%7B%22x%22%3A580%2C%22y%22%3A229%7D%7D%2C%22barriers%22%3A%5B%7B%22shape%22%3A%22sphere%22%2C%22p1%22%3A%7B%22x%22%3A429%2C%22y%22%3A211%7D%2C%22width%22%3A16%2C%22radius%22%3A74%2C%22material%22%3A%7B%22ambient%22%3A%5B0.10196078431372549%2C0.10196078431372549%2C0.10196078431372549%5D%2C%22diffuse%22%3A%5B0.20392156862745098%2C0.596078431372549%2C0.8588235294117647%5D%2C%22specular%22%3A%5B0.5019607843137255%2C0.5019607843137255%2C0.5019607843137255%5D%2C%22shininess%22%3A32%2C%22reflectivity%22%3A0%2C%22transparency%22%3A0%2C%22refractiveIndex%22%3A1.5%7D%7D%5D%7D&bounces=0&shadowRays=true"></iframe>

---

## Ray Tracer With Shadow Rays

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=spherewithpointlight&adaptiveTolerance=5000&maxAntialiasingSubdivisions=0"></iframe>

--

## Ray Tracer With Shadow Rays

<img src="images/whitted_raytracer/ray_tracer_with_shadow_rays.PNG" />

---

## Ray Tracer (2D) With Inter-Object Shadows

<iframe src="demo/backwards_ray_tracing2D/index.html?scene=%7B%22lights%22%3A%5B%7B%22x%22%3A712%2C%22y%22%3A362%2C%22color%22%3A%22%23FFFFFF%22%7D%5D%2C%22camera%22%3A%7B%22eye%22%3A%7B%22x%22%3A780%2C%22y%22%3A229%7D%2C%22lookat%22%3A%7B%22x%22%3A580%2C%22y%22%3A229%7D%7D%2C%22barriers%22%3A%5B%7B%22shape%22%3A%22rectangle%22%2C%22p1%22%3A%7B%22x%22%3A496%2C%22y%22%3A335%7D%2C%22p2%22%3A%7B%22x%22%3A535%2C%22y%22%3A227%7D%2C%22width%22%3A16%2C%22radius%22%3A30%2C%22material%22%3A%7B%22ambient%22%3A%5B0.10196078431372549%2C0.10196078431372549%2C0.10196078431372549%5D%2C%22diffuse%22%3A%5B0.9058823529411765%2C0.2980392156862745%2C0.23529411764705882%5D%2C%22specular%22%3A%5B0.5019607843137255%2C0.5019607843137255%2C0.5019607843137255%5D%2C%22shininess%22%3A32%2C%22reflectivity%22%3A0%2C%22transparency%22%3A0%2C%22refractiveIndex%22%3A1.5%7D%7D%2C%7B%22shape%22%3A%22rectangle%22%2C%22p1%22%3A%7B%22x%22%3A450%2C%22y%22%3A246%7D%2C%22p2%22%3A%7B%22x%22%3A559%2C%22y%22%3A114%7D%2C%22width%22%3A16%2C%22radius%22%3A30%2C%22material%22%3A%7B%22ambient%22%3A%5B0.10196078431372549%2C0.10196078431372549%2C0.10196078431372549%5D%2C%22diffuse%22%3A%5B0.20392156862745098%2C0.596078431372549%2C0.8588235294117647%5D%2C%22specular%22%3A%5B0.5019607843137255%2C0.5019607843137255%2C0.5019607843137255%5D%2C%22shininess%22%3A32%2C%22reflectivity%22%3A0%2C%22transparency%22%3A0%2C%22refractiveIndex%22%3A1.5%7D%7D%5D%7D&bounces=4&shadowRays=true"></iframe>

---

## Ray Tracer With Inter-Object Shadows

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=twosphereswithpointlight&adaptiveTolerance=5000&maxAntialiasingSubdivisions=0"></iframe>

--

## Ray Tracer With Inter-Object Shadows

<img src="images/whitted_raytracer/ray_tracer_with_shadow_rays_with_multiple_spheres.PNG" />

---

## Aliasing

<div class="cols-2 cols-2-1">

<div class="col">

Because we are sending only one ray per pixel, one pixel may have its ray hit the sphere and the next pixel over may miss it.
This causes a sudden change that feels unnatural.

**Solution**

 - Conceptually: Blur boundary pixels so that there is a more gradual step between the colors.

 - In Practice: Send multiple rays per pixel at slightly different offsets from the pixel's center and then average the resulting colors.

</div>

<div class="col">
    <div class="cols-2">
        <a>
            <img src="images/jaggies/jaggies.png" />
        </a>
        <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
            <img src="images/jaggies/aa-intro-circle.png" />
        </a>
    </div>
    <div class="cols-2">
        <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
            <img src="images/jaggies/aa-intro-circle-grid.0.png" />
        </a>
        <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
            <img src="images/jaggies/aa-intro-circle-jaggie.png" />
        </a>
    </div>
    <div>
    <a href="https://stefanoborini.com/a-raytracer-in-python-part-3-samplers/">
        <img src="images/antialiasing/antialiasing_explained.png" />
    </a>
    </div>
</div>

<!-- <div class="col">
    <a>
        <img src="images/jaggies/jaggies.png" />
    </a>
    <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
        <img src="images/jaggies/aa-intro-circle.png" />
    </a>
    <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
        <img src="images/jaggies/aa-intro-circle-grid.0.png" />
    </a>
    <a href="https://trout-cg-raytracing.blogspot.com/2006/10/anti-aliasing-kill-those-jaggies.html">
        <img src="images/jaggies/aa-intro-circle-jaggie.png" />
    </a>
</div> -->

</div>

---

## Whitted Ray Tracing: Adaptive Antialiasing

<div class="cols-2 cols-2-1">

<div class="col" style="font-size: 0.70em;">

**The Challenge:**
- Shooting $16$ or $64$ rays everywhere is slow.
- Most pixels in an image are uniform (smooth surfaces or empty background).
- Jaggies only appear at **high-contrast edges** (object silhouettes, shadow boundaries, specular highlights).

<p style="height: 0.5em;"></p>

**Adaptive Sampling**
1. Cast rays through the **4 corners** of each pixel (not the center).
2. Compare the four corner colors.
3. If they are similar (low contrast), **average them** and stop (1 ray per pixel on average, because adjacent pixels share corners).
4. If they differ by more than a threshold $e$ (an edge), **subdivide the pixel** into smaller sub-regions and sample deeper.

</div>

<div class="col" style="font-size: 0.70em;">

```text
      Pixel Corner Sampling & Subdivision
(0,0) ----------- (1,0)       +-----+-----+
  |                 |         |  *  |  *  |
  |      Pixel      |   ==>   +-----+-----+
  |                 |         |  *  |  *  |
(0,1) ----------- (1,1)       +-----+-----+
 Similar? Average them        Contrast > e ?
   (Zero extra cost)            Subdivide
```

<a href="https://www-f9.ijs.si/~matevz/docs/PovRay/pov155.htm">
    <img src="images/whitted_antialiasing.gif" />
</a>

</div>

</div>

---

## Whitted Antialiasing: The Algorithm & Math

<div class="cols-2">

<div class="col" style="font-size: 0.60em;">

**1. Corner Evaluation & Contrast Test**
Let the four corner sample radiances of pixel $(i,j)$ be $\mathbf{C}\_{00}, \mathbf{C}\_{10}, \mathbf{C}\_{01}, \mathbf{C}\_{11}$.

Measure the maximum contrast across all channels:
$$\Delta I = \max\_{c \in \\{r,g,b\\}} \left( \max(\mathbf{C})\_c - \min(\mathbf{C})\_c \right)$$

<p style="height: 0.2em;"></p>

**2. Decision Rule**
- **If $\Delta I < e$ (smooth region):**
  Accept the 4-corner average without spawning new rays:

  $$I\_{\text{pixel}} = \frac{1}{4} \left( \mathbf{C}\_{00} + \mathbf{C}\_{10} + \mathbf{C}\_{01} + \mathbf{C}\_{11} \right)$$

- **If $\Delta I \ge e$ (edge detected):**
  Subdivide into 4 sub-quadrants (quadtree) and cast 5 new rays (4 edge midpoints + 1 center).

</div>

<div class="col" style="font-size: 0.60em;">

**3. Recursive Quadtree Subdivision**
Each sub-pixel $k \in \\{0, 1, 2, 3\\}$ repeats the contrast test up to maximum depth $D\_{\max}$:

$$I\_{\text{pixel}} = \frac{1}{4} \sum\_{k=0}^3 I\_{\text{sub}, k}$$

```text
 c01 ------- cTop ------- c11
  |           |            |
  |   Quad 2  |   Quad 3   |
  |           |            |
cLeft ----- cCenter ---- cRight
  |           |            |
  |   Quad 0  |   Quad 1   |
  |           |            |
 c00 ------ cBottom ----- c10
```

- High recursion only on silhouettes, sharp shadows, and glass edges.
- Smooth regions evaluate with essentially **1 sample per pixel** amortized.

</div>

</div>

---

## Ray Tracer (2D) With Whitted Adaptive Antialiasing

<iframe src="demo/backwards_ray_tracing2D/index.html?scene=%7B%22lights%22%3A%5B%7B%22x%22%3A921%2C%22y%22%3A229%2C%22color%22%3A%22%23FFFFFF%22%7D%5D%2C%22camera%22%3A%7B%22eye%22%3A%7B%22x%22%3A780%2C%22y%22%3A229%7D%2C%22lookat%22%3A%7B%22x%22%3A580%2C%22y%22%3A229%7D%7D%2C%22barriers%22%3A%5B%7B%22shape%22%3A%22rectangle%22%2C%22p1%22%3A%7B%22x%22%3A492%2C%22y%22%3A289%7D%2C%22p2%22%3A%7B%22x%22%3A490%2C%22y%22%3A168%7D%2C%22width%22%3A16%2C%22radius%22%3A30%2C%22material%22%3A%7B%22ambient%22%3A%5B0%2C0%2C0%5D%2C%22diffuse%22%3A%5B0.20392156862745098%2C0.596078431372549%2C0.8588235294117647%5D%2C%22specular%22%3A%5B0%2C0%2C0%5D%2C%22shininess%22%3A0%2C%22reflectivity%22%3A0%2C%22transparency%22%3A0%2C%22refractiveIndex%22%3A1%7D%7D%5D%7D&antialiasing=true&maxAaSubdivisions=2&bounces=0&shadowRays=true"></iframe>

---

## Ray Tracer With Whitted Antialiasing

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=twosphereswithpointlight&maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer With Whitted Antialiasing

<img src="images/whitted_raytracer/ray_tracer_with_whitted_antialiasing.PNG" />

---

## Shadows In Whitted Ray Tracing

<p style="height: 1em;"></p>

Whitted ray tracing accounts for soft shadows *on* objects (by using the Phong model), but does not account for soft shadows *between* objects.

<p style="height: 1em;"></p>

**Why?**

Whitted ray tracing accounts for lights as **points in space**.

This causes every point on objects to either be lit by a light or not lit by a light (a binary).

Soft shadows require us to be able to figure out not just ***whether*** a point is in light, but ***how much*** that point is in light.

This is a limitation of Whitted ray tracing.

---

## Materials

<p style="height: 1em;"></p>

Wood, metal, and glass all look different.

<p style="height: 1em;"></p>

Wood soaks in light, metal can reflect other objects, and glass can not only reflect other objects but refract them too.

<p style="height: 1em;"></p>

For each of our objects, we will provide them a different *Material*.

---

## Materials: Lambertian, Specular, & Dielectric

<div style="font-size:0.8em;">

**Lambertian** (Matte / Diffuse) Materials
 - Cannot reflect or refract light.
 - Do not change brightness depending on where the viewer is looking from.
 - Examples: chalk, unpolished wood, or paper.

**Specular Materials**
 - Reflects light perfectly.
 - Does not refract light (is opaque).
 - Perfect mirrors like polished chrome, silver, or still water.

**Dielectric Materials**
 - Reflective and refractive.
 - Examples like clear glass, water, crystals, and diamonds.

<p style="height: 0.5em;"></p>

The spheres we have seen so far have had **Lambertian** materials.

</div>

---

## Whitted Ray Tracing Reflections

<p style="height: 0.5em;"></p>

When a light ray hits a reflective material, we:

<p style="height: 0.5em;"></p>

 - **Calculate the Reflection Vector**: Using the surface normal ($N$) and the incoming ray direction ($I$), the exact bounce direction ($R$) is calculated using standard vector reflection: $R = I - 2(I \cdot N)N$

<p style="height: 0.5em;"></p>

 - **Spawn a Secondary Ray**: Create a new "reflection ray" originating at the intersection point and traveling outward in direction $R$.

<p style="height: 0.5em;"></p>

 - **Recurse**: This new ray goes out into the scene to find what it hits. If it hits another mirror, it spawns yet another reflection ray.

---

## Ray Tracer: Reflective Material

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=twosphereswithpointlightreflective&maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer: Reflective Material

<img src="images/whitted_raytracer/ray_tracer_reflective_material.png" />

---

## Whitted Ray Tracing Reflection Limitations

Because Whitted ray tracing models reflective surfaces as perfect reflectors (sending off only one exact reflection ray per reflection) it has two major draw backs.

<p style="height: 1em;"></p>

**No Glossy/Rough Reflections**

It cannot do brushed metal, frosted glass, or car paint. Everything behaves like a flawless mirror.

<p style="height: 1em;"></p>

**No Diffuse Interreflection (Color Bleeding)**

It cannot handle light bouncing off a red wall and casting a red tint onto a white floor.

---

## Refractions

<div style="font-size:0.85em;">

When a light ray hits a refractive material, we:

<p style="height: 1em;"></p>

 - **Calculate a refraction ray using Snell’s Law**: The bending of light is governed by Snell's Law, which relates the angles of incidence and refraction to the indices of refraction of the two materials.

<p style="height: 1em;"></p>

 - **Trace the Transmitted Ray**: Just like a mirror reflection ray, a new refraction ray is spawned at the intersection point, heading into/out of the object.

<p style="height: 1em;"></p>

 - **Recurse**: The refraction ray travels until it hits the other side of the object (or exits back into the air) where it refracts again. This allows light to pass straight through a transparent object, bending twice (entering and exiting), which creates the characteristic distorted magnification look of lenses and glass spheres.

</div>

---

## Snell's Law

<div class="cols-2">

<div class="col" style="font-size:0.9em;">

Dielectric surfaces can have rays both reflect and refract off of them.

So when a ray hits a dielectric surface we spawn two rays:
 - a reflected ray (bouncing off the surface)
 - a refracted (transmitted) ray (going into the object)

Standard vector reflection determines the *reflected ray's* direction.

Snell's law determines the *refracted ray's* direction.

</div>

<div class="col">

<a href="https://www.slideserve.com/read/refraction-the-bending-of-a-light-ray-as-it-passes-from-one-medium-to-another">
<img src="images/reflection/snell.png">
</a>

</div>

</div>

---

## Modeling Ray Energy

<div class="cols-2">

<div class="col" style="font-size: 0.64em;">

Snell's Law determines *the direction* of the refracted light.

Fresnel's Equations determine *how much* energy is reflected vs. refracted (transmitted).

**Schlick's Approximation**

Fresnel's equations are expensive to compute, so schlick's approximation is typically used instead.

$$R(\theta) = R\_0 + (1 - R\_0)(1 - \cos\theta)^5$$

where $R$ is the reflected ray's energy and $R\_0$ is the amount of energy that would be reflected at the incident point if $\theta = 0^\circ$:

$$R\_0 = \left(\frac{n_1 - n_2}{n_1 + n_2}\right)^2$$

</div>

<div class="col" style="font-size: 0.60em;">

The refracted (transmitted) ray's energy is

$$T(\theta) = 1 - R(\theta)$$

The pixel color is

$$Color = (1 - R(\theta)) \cdot Color_{refracted} + R(\theta) \cdot Color_{reflected}$$

<p style="height: 1em;"></p>

**Ray Pruning**

Secondary rays (reflected and refracted rays) that will have a reflectance of $0$ are not spawned as the color the ray would result in can not contribute to the primary ray's color and would therefore be unnecessary work.

</div>

</div>

---

## Recursion

<div class="cols-2">

<div class="col" style="font-size: 0.9em;">

Rays can spawn secondary reflection and refraction rays depending on what they hit.

Reflection and refraction rays can spawn further reflection and refraction rays.

**To prevent infinite loops** (like two mirrors facing each other) and save computer power, Whitted ray tracers use a **max recursion depth** (e.g., 5 or 10 bounces). Once the limit is reached, or the ray hits the background sky, recursion stops, and the color is passed back up the chain.


</div>

<a href="https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-overview//light-transport-ray-tracing-whitted.html">
<img src="images/rt-recursive.png">
</a>

</div>

---

## Ray Tracer: Refractive Material

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=twosphereswithpointlightrefractive2&maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer: Refractive Material

<img src="images/whitted_raytracer/ray_tracer_refractive_material.png" />

---

## Ray Tracer With Different Materials

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer With Different Materials

<img src="images/whitted_raytracer/ray_tracer_with_different_materials.png"></img>

---

## Ray Tracer: Many Spheres, Many Materials

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=manyspheresmanymaterials&maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer: Many Spheres, Many Materials

<img src="images/whitted_raytracer/ray_tracer_many_spheres_many_materials.png">

---

## Ray Tracer: Complex Materials Showcase

<iframe class="keepalive" src="demo/whitted_raytracer/index.html?scene=materialshowcase&maxAntialiasingSubdivisions=3"></iframe>

--

## Ray Tracer: Complex Materials Showcase

<img src="images/whitted_raytracer/ray_tracer_complex_materials_showcase.png">

---

## Whitted Ray Tracing: Limitations

<div style="font-size: 0.9em;">

 - Hard, Binary Shadows
   - Assumes point lights for all lights in the scene. This causes lights to either be visible (can draw a ray from the surface to it) or in total shadow. It cannot handle **soft shadows** with penumbras produced by real-world lights.

<p></p>

 - No Indirect Diffuse Illumination (Color Bleeding)
   - Only calculates direct illumination for diffuse surfaces (using a lambertian term and shadow rays). It completely ignores light bouncing from one diffuse surface to another.

<p></p>

 - Restricted to Perfect Specular Materials
   - Splits secondary rays into exact mathematical directions: a single reflection ray and a single refraction ray. It cannot handle glossy or rough materials that scatter light in a distribution.

</div>

---

## THE Rendering Equation

<div style="font-size:1em;">

<p style="height:1em"></p>

Introduced by James Kajiya in 1986, the Rendering Equation describes all light transport in a scene:

$$L_o(x, \omega_o) = L_e(x, \omega_o) + \int_{\Omega} f_r(x, \omega_i, \omega_o) L_i(x, \omega_i)(\omega_i \cdot n) d\omega_i$$

<p style="height:1em"></p>

**What it means**

The outgoing light ($L_o$) from a point on a surface in a given direction is the sum of its own emitted light ($L_e$) plus the reflection of all incoming light ($L_i$) from the surrounding hemisphere ($\Omega$), modulated by a material's surface properties (BRDF, $f_r$) and geometry ($\omega_i \cdot n$).

</div>

---

## Why The Light Equation Is Difficult

<div style="font-size:0.75em;">

<p style="height:0.5em"></p>

**Infinite Branching**

When a single ray of light hits a surface, it doesn't just stop—it scatters and reflects in every possible direction across a hemisphere. If you tried to trace every outgoing ray from that single hit, you would have to spawn thousands of new rays. And when those secondary rays hit their next surfaces, they do the exact same thing, causing the number of rays to explode exponentially.

<p style="height:1em"></p>

**Infinite Recursion**

Light bounces around a room an infinite number of times before completely dissipating.

<p style="height:1em"></p>

**Infinite Computation**

Because space is continuous and light paths branch infinitely, calculating "all light rays" (which is what the equation is really telling us to do) analytically or deterministically is computationally impossible (it would require infinite memory and time).

<p style="height:1em"></p>

Verdict: Since we cannot solve directly, we will *approximate* the result.

</div>

---

## (Stochastic) Monte Carlo Ray Tracing

**Stochastic**: using randomness

**Monte Carlo**: using sampling to estimate a numerical error

<p style="height: 0.5em;"></p>

Rather than
 - evaluating an absurd number of incoming light rays (brute force)
 - trying to directly calculate the answer (Whitted ray tracing)

we should try to *converge* on the correct answer using **random sampling**.

<p style="height: 0.5em;"></p>

If each sample is an **unbiased** estimator of light transport, and our sampling accounts for the geometry of the scene, then the Law of Large Numbers guarantees that, as we take more samples, the variance will decrease and our rendered image will converge on the true physical solution.

---

## (Stochastic) Monte Carlo Ray Tracing Is Non-Deterministic

<p style="height: 1em;"></p>

Unlike with classical Whitted ray tracing, Monte Carlo ray tracing is non-deterministic.

<p style="height: 1em;"></p>

Even given the same inputs, we are not gaurenteed the same outputs.

<p style="height: 1em;"></p>

All that Monte Carlo says is that, as we take more samples, we are *more and more likely* to end up closer to the physical solution (the "correct" result).

---

## For The Math...

Peter Shirley's foundational guide to writing a practical ray tracer.

<p style="height: 0.5em;"></p>

<a href="https://raytracing.github.io/books/RayTracingInOneWeekend.html" target="_blank" class="center-h" style="height: 85%;">
    <img src="images/ray_tracing_one_weekend_books.png" alt="Ray Tracing in One Weekend Series" style="height:85%;" />
</a>

---

## Monte Carlo: Cameras

<div class="cols-2">

<div class="col">

The cameras we will use are the same as the ones used for Whitted ray tracing.

For an orthographic camera, we will send rays directly from the projected pixels.

For a perspective camera, we will project the pixel plane in front of the eye point and then send rays through their centers.

</div>

<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_orthographic_views.jpg" />
</a>
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_perspective_views.jpg" />
</a>
</div>

</div>

---

## Monte Carlo: Modeling Light Bounces

<p style="height: 0.5em;"></p>

To model bouncing off of different surfaces, we need each surface's Bidirectional Reflectance Distribution Function (BRDF).

<p style="height: 0.5em;"></p>

A surface's BRDF tells us how likely a ray is to bounce in a given direction when it hits a given surface.

<p style="height: 0.5em;"></p>

We use each surface's BRDF to weight the random chance the rays spawned at the hit point will be sent in a given direction.

<p style="height: 0.5em;"></p>

Depth Limit: to prevent infinite recursion (e.g. light bouncing between two mirrors facing eachother), we add a limit to the number of bounces a light ray can take.

---

## Monte Carlo: Lambertian Materials

<div class="cols-2 cols-2-1">

<div class="col" style="font-size:1em;">

Lambertian materials reflect incoming light equally in all directions.

<p style="height: 0.5em;"></p>

We can calculate this by taking the surface normal at a position and adding a random unit vector to it.

<p style="height: 0.5em;"></p>

Notice that we only send *one* scatter ray.
We focus on only one path at a time and let later rays (that we send from the same pixel) handle the other possible bounce directions.

</div>

<div class="col">
    <img src="images/reflection/diffuse.png">
<div>

</div>

---

## Monte Carlo: Ambient Light

<p style="height: 1em;"></p>

Rather than adding light to the overall term, we add a brightness to the background of the scene.

<p style="height: 1em;"></p>

When a ray travels off into nothingness, we add the background color of the scene to the ray to give it some brightness even when it does not reach a "real" light source.

<p style="height: 1em;"></p>

If the ray reaches the bounce depth limit before bouncing off into nothingness, the background color is not added.

---

## Monte Carlo Demo: Two Spheres

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=diffuse&maxDepth=25&samplesPerPixel=1&aaJitter=false"></iframe>

--

## Monte Carlo Demo: Two Spheres

<img src="images/montecarlo_ratracer/two_spheres.PNG" />

---

## Monte Carlo: Noise

<div style="font-size: 0.9em;">

Because we are taking random samples, some samples are spot on and some are way off.

<p style="height: 0.5em;"></p>

When we average them, it is random (but getting closer and closer to the correct solution as we take more samples) how close we will be to the correct physical result.

<p style="height: 0.5em;"></p>

This causes pixels that are right next to eachother to be slightly off-color in different directions (some are brighter, some are darker than they should be).

<p style="height: 0.5em;"></p>

This problem is similar to aliasing but is not as easy to fix.

<p style="height: 0.5em;"></p>

**The Convergence Rate ($O(1/\sqrt{N})$)**

Unfortunately, *getting rid of the noise becomes increasingly expensive*. To cut the visual noise (graininess) in half, you do not have to just double your sample count, you must *quadruple* it.

</div>

---

## Monte Carlo Demo: Two Spheres (25 Samples Per Pixel)

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=diffuse&maxDepth=25&samplesPerPixel=25&aaJitter=false"></iframe>

--

## Monte Carlo Demo: Two Spheres (25 Samples Per Pixel)

<img src="images/montecarlo_ratracer/two_spheres_25_samples_per_pixel.PNG" />

---

## Notice: Soft Shadows!

<p style="height: 1em;"></p>

We see soft shadows in the image because our samples can use the number of bounces they take to reach the light source to approximate how much energy the light ray lost.

<p style="height: 1em;"></p>

Over many different samples, the average of the returned color brightnesses tell us how bright the pixel should be.

<p style="height: 1em;"></p>

This allows us to measure not just *whether* a point is in light, but *how much* the point is in in light.

---

## Monte Carlo: Antialiasing

<div class="cols-2 cols-2-1">

<div class="col" style="font-size:0.95em;">

In order to get rid of aliasing, we must take an average over the area to get the average color.

Since we already expect to take multiple samples per pixel, we do not have to to use a pixel grid or Whitted's antialiasing method.

Instead, we can randomly "jitter" the pixel center for each sample we take.

The larger the amount of jitter we add to the pixel center (e.g. randomly add between 0 and 0.1 units to it in a random direction, 0.2 units, etc.), the larger the area we will average over as we take more samples.

</div>

<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_orthographic_views.jpg" />
</a>
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_perspective_views.jpg" />
</a>
</div>

</div>

---

## Monte Carlo Demo: Two Spheres (Antialiased)

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=diffuse&maxDepth=25&samplesPerPixel=25&aaJitter=true"></iframe>

--

## Monte Carlo Demo: Two Spheres (Antialiased)

<img src="images/whitted_raytracer/ray_tracer_two_sphere_antialiased.png" />

---

## Metal Materials: Specular Reflection and Roughness

<div class="cols-2">
<div class="col" style="font-size: 0.70em;">

### Smooth Mirror Reflection

For polished metals, incident rays reflect symmetrically across the surface normal:

- Produces mirror reflections of the sky and neighboring objects.
- Does not scatter randomly across the hemisphere.

### Adding Surface Roughness (Fuzz)

Real metals have microscopic imperfections.

We simulate roughness by jittering the reflected ray endpoint using a random sphere scaled by **fuzz**:
- **fuzz = 0:** polished chrome mirror
- **fuzz = 0.5:** brushed aluminum or satin metal
- **fuzz = 1.0:** fully diffuse-like metallic sheen

</div>
<div class="col" style="font-size: 0.82em;">

<img src="images/reflection/specular.png">

<img src="images/reflection/glossy.png">

</div>
</div>

---

## Monte Carlo Demo: Polished and Brushed

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=materials&samplesPerPixel=25"></iframe>

--

## Monte Carlo Demo: Polished and Brushed

<img src="images/montecarlo_ratracer/polished_and_brushed.png">

---

## Monte Carlo: Dielectric Materials

<div class="cols-2 cols-2-1">
<div class="col" style="font-size: 0.80em;">

Clear materials like glass, water, and diamonds transmit and bend light.

**1. Snell's Law**
Light bends toward the normal when entering glass and bends away when exiting into air.

**2. Total Internal Reflection**
When exiting glass at shallow angles, light cannot refract and reflects completely like a mirror.

**3. Fresnel's Equations (Schlick's Approximation)**
Reflectivity increases at grazing view angles, producing realistic edge glare.

We use the aforementioned math to determine the likelihood that the ray will refract vs. reflect and use that to weight the random chance of it actually doing one or the other.
Over multiple samples, we will model both phonemena.

</div>
<div class="col">
<a href="https://www.slideserve.com/read/refraction-the-bending-of-a-light-ray-as-it-passes-from-one-medium-to-another">
<img src="images/reflection/snell.png">
</a>
</div>
</div>

---

## Monte Carlo Demo: Dielectrics

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=dielectric&samplesPerPixel=50"></iframe>

--

## Monte Carlo Demo: Dielectrics

<img src="images/montecarlo_ratracer/dielectrics.png">

---

## Bounding Volume Hierarchies: BVH Trees

<div class="cols-2 cols-2-1">
<div class="col" style="font-size: 0.80em;">

Testing rays against every primitive in a complex scene requires $O(N)$ operations per ray.

**How BVH Acceleration Works:**
- Enclose all objects in an Axis-Aligned Bounding Box (AABB).
- Recursively subdivide objects along the longest bounding axis into left and right child boxes.
- Rays test against the bounding box first.
- If a ray misses a parent bounding box, all objects inside that branch are skipped immediately.
- Reduces intersection checks from linear $O(N)$ to logarithmic $O(\log N)$ time.

</div>
<div class="col">
<a href="https://www.youtube.com/watch?v=C1H4zIiCOaI">
    <img src="images/bvh/bvh_dragon.PNG" />
</a>
<a href="https://www.youtube.com/watch?v=C1H4zIiCOaI">
    <img src="images/bvh/bvh_dragon_near_miss.PNG" />
</a>
</div>
</div>

--

## Demo: Bounding Volume Hierarchy

<iframe src="https://erichlof.github.io/THREE.js-PathTracing-Renderer/BVH_Visualizer.html"></iframe>

---

## Monte Carlo Demo: Many Spheres Everywhere

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=camera&aabb=true&samplesPerPixel=25"></iframe>

--

## Monte Carlo Demo: Many Spheres Everywhere

<img src="images/montecarlo_ratracer/many_spheres_everywhere.png" />

---

## Positionable Camera: View and Field of View

<div>

<p style="height: 1em;"></p>

To look at scenes from any angle, we define an arbitrary camera frame:
- **lookfrom:** camera position in world space
- **lookat:** the point the camera aims toward
- **vup:** view-up vector indicating camera tilt
- **vfov:** vertical field of view in degrees

<p style="height: 1em;"></p>

A narrow field of view acts like a telephoto lens (zooming in), while a wide field of view provides wide-angle perspective.

</div>

---

## Monte Carlo Demo: Camera Perspective (vfov = 20)

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=dielectric&vfov=20&samplesPerPixel=50"></iframe>

--

## Monte Carlo Demo: Camera Perspective (vfov = 20)

<img src="images/montecarlo_ratracer/camera_perspective.png" />

---

## Monte Carlo: Defocus Blur

<div class="cols-2 cols-2-1">
<div class="col" style="font-size: 0.80em;">

Pinhole cameras keep everything in infinite focus. Real cameras use physical lenses that blur objects outside the focal plane.

To generate defocus blur, we will Jitter each ray's origin randomly around the the eye point before sending each ray into the scene.

This will cause, for each pixel, all of its rays to go through one point in space (the pixel center) but from different starting locations.

The only point that we take a consistent color of, then, is the pixel's center.

For the bottom picture on the right, notice that we are doing this *per pixel*.
Accross the multiple samples we take for each pixel, only points on the focus plane remain in focus. 

</div>
<div class="col">
<a href="https://www.tutorialspoint.com/computer_graphics/computing_viewing_rays_in_ray_tracing.htm">
    <img src="images/generating_rays_for_perspective_views.jpg" />
</a>
<a href="https://raytracing.github.io/books/RayTracingInOneWeekend.html#diffusematerials">
    <img src="images/montecarlo_ratracer/defocus_blur.jpg" />
</a>
</div>
</div>

---

## Monte Carlo Demo: Defocus Blur

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=defocus&samplesPerPixel=50"></iframe>

--

## Monte Carlo Demo: Defocus Blur

<img src="images/montecarlo_ratracer/defocus_blur.png" />

---

## Motion Blur: Camera Shutter Interval

<div class="col" style="font-size: 0.85em;">

<p style="height: 0.5em;"></p>

Real camera shutters remain open for a brief exposure interval $[t_0, t_1]$.

<p style="height: 0.5em;"></p>

**Simulating Motion Blur**

Assign each ray a random time $t \in [t_0, t_1]$ upon generation.

Moving objects interpolate their position based on the ray's time.

Ray intersection tests use the object's position at that specific moment.

Averaging many samples creates smooth motion streaks for moving objects while stationary objects stay crisp.

</div>

---

## Monte Carlo Demo: Motion Blur

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=motionblur&samplesPerPixel=50"></iframe>

--

## Monte Carlo Demo: Motion Blur

<img src="images/montecarlo_ratracer/motion_blur.png" />

---

## Monte Carlo: Basic Texturing (3D Checker Pattern)

<div class="col" style="font-size: 0.85em;">

<p style="height: 0.25em;"></p>

Textures allow surface properties to vary across space rather than remaining constant.

<p style="height: 0.25em;"></p>

We modify our hit-tests to test not just where in 3D space a hit took place but also *where on the surface of the object* did the ray hit.

<p style="height: 0.25em;"></p>

Using this information we can then color the surface (or give it other properties) however we like.

<p style="height: 0.25em;"></p>

For example, we can:
 - Map the surface to a procedural texture.
 - Map the surface to procudural noise.
 - Map the surface to an image.

</div>

---

## Monte Carlo Demo: 3D Checker Pattern

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=checker&samplesPerPixel=25"></iframe>

--

## Monte Carlo Demo: 3D Checker Pattern

<img src="images/montecarlo_ratracer/3d_checker_pattern.png" />

---

## Monte Carlo Demo: Perlin Noise

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=perlin&samplesPerPixel=25"></iframe>

--

## Monte Carlo Demo: Perlin Noise

<img src="images/montecarlo_ratracer/perlin_noise.png" />

---

## Monte Carlo Demo: Picture Texture

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=earth&samplesPerPixel=25"></iframe>

--

## Monte Carlo Demo: Picture Texture

<img src="images/montecarlo_ratracer/picture_texture.png" />

---

## Monte Carlo: Emissive Surfaces

<div style="font-size: 0.95em;">

<p style="height: 0.5em;"></p>

In real life, light comes from physical surfaces rather than abstract point sources or background skies.

<p style="height: 0.5em;"></p>

**Emissive Surfaces**

<p style="height: 0.1em;"></p>

Emissive surfaces emit light.

<p style="height: 0.1em;"></p>

When a ray hits an emissive surface, the surface's color is added directly to the ray's radiance.

<p style="height: 0.1em;"></p>

How lit a pixel is becomes a matter of how often its samples hit an emissive surface.

<p style="height: 0.1em;"></p>

This naturally generates soft shadows with realistic penumbras because rays sample different points across the light area with different liklihoods.

</div>

---

## Monte Carlo: Cornell Box

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=cornell&samplesPerPixel=1000"></iframe>

--

## Monte Carlo: Cornell Box

<img src="images/montecarlo_ratracer/cornell_box.png">

---

## Monte Carlo: Volumetric Media

<div class="col" style="font-size: 1em;">

Light passing through fog, mist, or smoke scatters inside the volume rather than bouncing only at boundaries.

**Constant Density Medium:**
 - When a ray enters a boundary of the media, we calculate the distance it travels through the volume (randomly varying how far it travels based on the properties of the media).
 - If the light ray ends up in the volume, then we randomly select its bounce direction.
 - High density media (such as smoke) absorbs light, while low density (such as mist) creates soft atmospheric glow.

</div>

---

## Monte Carlo Demo: Smoke and Fog

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=cornellsmoke&samplesPerPixel=1000"></iframe>

--

## Monte Carlo Demo: Smoke and Fog

<img src="images/montecarlo_ratracer/smoke_and_fog.PNG">

---

## Monte Carlo: Final Showcase

<iframe class="keepalive" src="demo/montecarlo_raytracer/index.html?scene=book2final&aabb=true&samplesPerPixel=1000"></iframe>

--

## Monte Carlo: Final Showcase

<img src="images/montecarlo_ratracer/final_showcase.PNG">

---

## What Did We Learn?

 - What light phenomena make images seem realistic.
 - How light-based rendering differs from model-based rendering.
 - How ray tracing can be used in the real world.
 - How to perform Whitted ray tracing.
 - How to perform Monte Carlo ray tracing.

---

<!-- .slide: class="title-slide" -->

<!-- [UW-Madison Department of Computer Sciences](https://www.cs.wisc.edu/) -->
<!-- [UW-Madison Brand Crest](https://brand.wisc.edu/identity/logos/) -->

<!-- # Thank You -->

<!-- ### Questions &amp; Discussion -->

<img class="title-crest" src="images/uw-crest-color-web-digital.png" alt="UW Crest" />

<div class="title-meta">
  CS 559 Computer Graphics &bull; University of Wisconsin&ndash;Madison<br>
</div>
