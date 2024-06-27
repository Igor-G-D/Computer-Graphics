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

    // Define probabilities for each object
    var probabilities = [0.2, 0.4, 0.4]; // Tree, dead tree, stump
    var numObjects = 100;

    // Function to choose an object based on probabilities
    function chooseObject() {
        const rand = Math.random();
        let sum = 0;
        for (let i = 0; i < probabilities.length; i++) {
            sum += probabilities[i];
            if (rand < sum) {
                return i;
            }
        }
        return probabilities.length - 1;
    }

    // Generate random positions and choose objects
    const instances = [];
    for (let i = 0; i < numObjects; i++) {
        const objIndex = chooseObject();
        const x = (Math.random() - 0.5) * 5000;
        const z = (Math.random() - 0.5) * 5000;
        const rotation = Math.random() * Math.PI * 2;
        instances.push({ objIndex, x, z, rotation });
    }

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
        const cameraRadius = 3000; // Distance from the center
        const cameraAngle = degToRad(45); // Angle in radians
        const cameraX = cameraRadius * Math.sin(cameraAngle);
        const cameraZ = cameraRadius * Math.cos(cameraAngle);
        const cameraPosition = [cameraX, 1500, cameraZ]; // Position the camera above the scene

        const cameraTarget = [0, 0, 0]; // Look at the center of the scene

        const camera = m4.lookAt(cameraPosition, cameraTarget, up);
        const view = m4.inverse(camera);

        const u_reverseLightDirection = m4.normalize([0.5, 0.7, 1]);

        const sharedUniforms = {
            u_reverseLightDirection,
            u_view: view,
            u_projection: projection,
            u_ambientLight: [0.1, 0.1, 0.1], // Ambient light
        };

        gl.useProgram(meshProgramInfo.program);

        // calls gl.uniform
        twgl.setUniforms(meshProgramInfo, sharedUniforms);

        // Render each instance at its position
        for (const instance of instances) {
            const { objIndex, x, z } = instance;
            const { obj, parts } = objects[objIndex];
            const extents = getGeometriesExtents(obj.geometries);
            const range = m4.subtractVectors(extents.max, extents.min);
            // amount to move the object so its center is at the origin
            var objOffset = m4.scaleVector(
                m4.addVectors(
                    extents.min,
                    m4.scaleVector(range, 0.5)),
                -1);
            objOffset[1] = 0 // don't move on the y plane

            // compute the world matrix once since all parts
            // are at the same space.
            let u_world = m4.yRotation(time*0.25);
            u_world = m4.translate(u_world, ...objOffset);
            u_world = m4.translate(u_world, x, -400, z); // Apply the random position
            individual_rotation = m4.yRotation(instance.rotation);

            u_world = m4.multiply(u_world, individual_rotation)
            

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
    const zNear = range[2] * 0.1;
    const zFar = range[2] * 10;

    render();
}

main();
