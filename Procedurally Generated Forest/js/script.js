async function main() {
    // Get A WebGL context
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        return;
    }

    // Tell the twgl to match position with a_position etc..
    twgl.setAttributePrefix("a_");

    const vs = `#version 300 es
      in vec4 a_position;
      in vec3 a_normal;

      uniform mat4 u_projection;
      uniform mat4 u_view;
      uniform mat4 u_world;
      uniform mat4 u_worldInverseTranspose;

      out vec3 v_normal;

      void main() {
        gl_Position = u_projection * u_view * u_world * a_position;
        v_normal = mat3(u_worldInverseTranspose) * a_normal;
      }
    `;

    const fs = `#version 300 es
      precision highp float;

      in vec3 v_normal;

      uniform vec4 u_diffuse;
      uniform vec3 u_reverseLightDirection;
      uniform vec3 u_ambientLight; // Add ambient light uniform

      out vec4 outColor;

      void main () {
        vec3 normal = normalize(v_normal);
        vec3 lightDir = normalize(u_reverseLightDirection);

        // Diffuse lighting with a softening factor
        float diffuse = max(dot(normal, lightDir), 0.0) * 0.3 + 0.3; // Softening factor applied here

        // Combine ambient and diffuse lighting
        vec3 color = u_diffuse.rgb * (u_ambientLight + diffuse);

        outColor = vec4(color, u_diffuse.a);
      }
    `;

    // compiles and links the shaders, looks up attribute and uniform locations
    const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);

    // loading all the different assets

    const objColors = [
        [ // Tree colors
            [0.0, 1.0, 0.0, 1.0], // Green
            [0.0, 1.0, 0.0, 1.0], // Green
            [0.0, 1.0, 0.0, 1.0], // Green
            [0.0, 1.0, 0.0, 1.0], // Green
            [0.6, 0.3, 0.0, 1.0] // Brown
        ],
        [ // Dead tree colors
            [0.6, 0.3, 0.0, 1.0] // Brown
        ],
        [ // Stump colors
            [0.6, 0.3, 0.0, 1.0] // Brown
        ]
    ];

    const files = [
        '/Objects/Low_Poly_Forest_tree01.obj', // tree
        '/Objects/Low_Poly_Forest_tree06.obj', // dead tree
        '/Objects/Low_Poly_Forest_treeBlob04.obj' // tree stump
    ];

    const objects = [];

    for (let i = 0; i < files.length; i++) {
        const objinfo = await loadObjBufferVAO(files[i], objColors[i]);
        objects.push(objinfo); // Add parts to objects array
    }

    // Define offsets for each object in the xz plane
    const offsets = [
        [-300, 0, -300], // Offset for the first object (tree)
        [300, 0, -300],  // Offset for the second object (dead tree)
        [0, 0, 300]    // Offset for the third object (tree stump)
    ];

    function degToRad(deg) {
        return deg * Math.PI / 180;
    }

    function render(time = 0) {
        time *= 0.001;  // convert to seconds

        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.enable(gl.DEPTH_TEST);

        const fieldOfViewRadians = degToRad(60);
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

        const up = [0, 1, 0];
        // Compute the camera's matrix using look at.
        const camera = m4.lookAt(cameraPosition, cameraTarget, up);

        // Make a view matrix from the camera matrix.
        const view = m4.inverse(camera);

        const u_reverseLightDirection = m4.normalize([0.5, 0.7, 1]);

        const sharedUniforms = {
            u_reverseLightDirection,
            u_view: view,
            u_projection: projection,
            u_ambientLight: [0.2, 0.2, 0.2], // Ambient light
        };

        gl.useProgram(meshProgramInfo.program);

        // calls gl.uniform
        twgl.setUniforms(meshProgramInfo, sharedUniforms);

        // Render each object with its own offset
        for (let i = 0; i < objects.length; i++) {
            const { obj, parts } = objects[i];
            const extents = getGeometriesExtents(obj.geometries);
            const range = m4.subtractVectors(extents.max, extents.min);
            // amount to move the object so its center is at the origin
            const objOffset = m4.scaleVector(
                m4.addVectors(
                    extents.min,
                    m4.scaleVector(range, 0.5)),
                -1);

            // compute the world matrix once since all parts
            // are at the same space.
            let u_world = m4.yRotation(time);
            u_world = m4.translate(u_world, ...objOffset);
            u_world = m4.translate(u_world, ...offsets[i]); // Apply the object-specific offset

            const u_worldInverse = m4.inverse(u_world);
            const u_worldInverseTranspose = m4.transpose(u_worldInverse);

            for (const { bufferInfo, vao, material } of parts) {
                // set the attributes for this part.
                gl.bindVertexArray(vao);
                // calls gl.uniform
                twgl.setUniforms(meshProgramInfo, {
                    u_world,
                    u_worldInverseTranspose,
                    u_diffuse: material.u_diffuse,
                });
                // calls gl.drawArrays or gl.drawElements
                twgl.drawBufferInfo(gl, bufferInfo);
            }
        }

        requestAnimationFrame(render);
    }

    async function loadObjBufferVAO(filepath, colors) {
        const response = await fetch(filepath);
        const text = await response.text();
        const obj = parseOBJ(text);

        const parts = obj.geometries.map(({ data }, index) => {
            const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
            const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);
            return {
                material: {
                    u_diffuse: colors[index % colors.length],
                },
                bufferInfo,
                vao,
            };
        });

        return { obj, parts }; // Return the parts array containing VAOs
    }

    // Compute camera parameters based on the first object
    const extents = getGeometriesExtents(objects[0].obj.geometries);
    const range = m4.subtractVectors(extents.max, extents.min);
    const objOffset = m4.scaleVector(
        m4.addVectors(
            extents.min,
            m4.scaleVector(range, 0.5)),
        -1);
    const cameraTarget = [0, 0, 0];
    const radius = m4.length(range) * 1.2;
    const cameraPosition = m4.addVectors(cameraTarget, [
        0,
        0,
        radius,
    ]);
    const zNear = radius / 100;
    const zFar = radius * 3;

    render();
}

main();