async function main() {
    const rng = new RNG(2)
    const useCube = false
    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        return;
    }

    twgl.setAttributePrefix("a_");

    const vs = `
    #version 300 es
    in vec4 a_position;
    in vec3 a_normal;

    uniform mat4 u_projection;
    uniform mat4 u_view;
    uniform mat4 u_world;
    uniform mat4 u_lightWorldViewProjection;

    out vec3 v_normal;
    out vec4 v_shadowCoord;

    void main() {   
        // Apply world transformation to the vertex
        vec4 worldPosition = u_world * a_position;
        
        // Calculate the final position of the vertex
        gl_Position = u_projection * u_view * worldPosition;

        // Pass the normal, transformed to world space
        v_normal = mat3(u_world) * a_normal;

        // Calculate shadow coordinates using global world position
        v_shadowCoord = u_lightWorldViewProjection * worldPosition;
    }
    `;
    const fs = `
    #version 300 es
    precision highp float;

    in vec3 v_normal;
    in vec4 v_shadowCoord;

    uniform vec4 u_diffuse;
    uniform vec3 u_reverseLightDirection;
    uniform vec3 u_ambientLight;
    uniform sampler2D u_shadowMap; 

    out vec4 outColor;

    float getShadow(vec4 shadowCoord) {
        vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
        projCoords = projCoords * 0.5 + 0.5;  // Transform to [0, 1] range

        if (projCoords.x < 0.0 || projCoords.x > 1.0 || projCoords.y < 0.0 || projCoords.y > 1.0) {
            return 1.0;
        }

        float currentDepth = projCoords.z - 0.0005;

        float shadow = 0.0;
        vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0)); 

        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                float pcfDepth = texture(u_shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
                shadow += currentDepth > pcfDepth ? 0.5 : 1.0;
            }
        }
        shadow /= 25.0;

        return shadow;
    }



    void main () {
        vec3 normal = normalize(v_normal);
        vec3 lightDir = normalize(u_reverseLightDirection);

        // Diffuse lighting with a softening factor
        float diffuse = max(dot(normal, lightDir), 0.0) * 0.3 + 0.5;

        // Combine=ing ambient and diffuse lighting
        vec3 color = u_diffuse.rgb * (u_ambientLight + diffuse);

        // Calculate shadow
        float shadow = getShadow(v_shadowCoord);

        outColor = vec4(color * shadow, u_diffuse.a);
    }
    `;

    const shadowVs = `
    #version 300 es
    in vec4 a_position;

    uniform mat4 u_world;
    uniform mat4 u_lightViewProjection;

    void main() {
    gl_Position = u_lightViewProjection * u_world * a_position;
    }

    `; 
    const shadowFs = `
    #version 300 es
    precision highp float;

    void main() {
    // No output needed, depth is automatically written to the depth buffer
    }
    `; 

    const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);
    const shadowProgramInfo = twgl.createProgramInfo(gl, [shadowVs, shadowFs]);

    // Create depth texture and framebuffer for shadow map
    const depthTextureSize = 4096;
    const depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, depthTextureSize, depthTextureSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);


    const objects = await loadObjects();

    function drawCameraScene(time, projection, view, programInfo, lightWorldViewProjection, reverseLightDirection) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.useProgram(programInfo.program);
        twgl.setUniforms(programInfo, {
            u_view: view,
            u_projection: projection,
            u_reverseLightDirection: reverseLightDirection,
            u_ambientLight: [0.1, 0.1, 0.1],
            u_shadowMap: depthTexture, // Bind shadow map texture
            u_lightWorldViewProjection: lightWorldViewProjection,
        });

        //drawing plane
        gl.bindVertexArray(planeVao);

        let u_world = m4.yRotation(time * 0.05);

        let u_worldInverse = m4.inverse(u_world);
        let u_worldInverseTranspose = m4.transpose(u_worldInverse); // for lighting


        twgl.setUniforms(meshProgramInfo, {
            u_world,
            u_worldInverseTranspose,
            u_diffuse:  [0.0, 0.5, 0.0, 1.0], // dark green
        });

        twgl.drawBufferInfo(gl, planeBufferInfo);
    
        // Render each instance at its position
        for (const linex of grid) {
            for (const columnz of linex) {
                const objTypeIndex = columnz.objTypeIndex;
                const objIndex = columnz.objIndex;
                const objPosition = columnz.position;
                const objRotation = columnz.rotation;
                const { obj, parts } = objects[objTypeIndex][objIndex];
                const extents = getGeometriesExtents(obj.geometries);
                const range = m4.subtractVectors(extents.max, extents.min);

                // Amount to move the object so its center is at the origin
                var objOffset = m4.scaleVector(
                    m4.addVectors(extents.min, m4.scaleVector(range, 1)),
                    -1
                );
                objOffset[1] = 0; // don't move on the y plane

                // Compute the world matrix once since all parts are at the same space.
                u_world = m4.yRotation(time * 0.05);
                u_world = m4.translate(u_world, ...objOffset);
                u_world = m4.translate(u_world, ...objPosition); // Apply the random position
                individual_rotation = m4.yRotation(objRotation);

                u_world = m4.multiply(u_world, individual_rotation);

                u_worldInverse = m4.inverse(u_world);
                u_worldInverseTranspose = m4.transpose(u_worldInverse);

                for (const { bufferInfo, vao, material } of parts) {
                    // Set the attributes for this part.
                    gl.bindVertexArray(vao);
                    // Calls gl.uniform
                    twgl.setUniforms(programInfo, {
                        u_world,
                        u_worldInverseTranspose,
                        u_diffuse: material.u_diffuse,
                    });
                    // Calls gl.drawArrays or gl.drawElements
                    twgl.drawBufferInfo(gl, bufferInfo);
                }
            }
        }
    }

    function drawShadowScene(time, lightViewProjection, shadowProgramInfo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
        gl.viewport(0, 0, depthTextureSize, depthTextureSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        
        // Render shadow scene
        gl.useProgram(shadowProgramInfo.program);
    

        // Render each instance at its position
        for (const linex of grid) {
            for (const columnz of linex) {
                const objTypeIndex = columnz.objTypeIndex;
                const objIndex = columnz.objIndex;
                const objPosition = columnz.position;
                const objRotation = columnz.rotation;
                const { obj, parts } = objects[objTypeIndex][objIndex];
                const extents = getGeometriesExtents(obj.geometries);
                const range = m4.subtractVectors(extents.max, extents.min);

                // amount to move the object so its center is at the origin
                var objOffset = m4.scaleVector(
                    m4.addVectors(extents.min, m4.scaleVector(range, 1)),
                    -1
                );
                objOffset[1] = 0; // don't move on the y plane

                // Compute the world matrix once since all parts are at the same space.
                individual_rotation = m4.yRotation(objRotation);

                u_world = m4.yRotation(time * 0.05); // or 0 for no rotation
                u_world = m4.translate(u_world, ...objOffset);
                u_world = m4.translate(u_world, ...objPosition);
                u_world = m4.multiply(u_world, individual_rotation);

                for (const { bufferInfo, vao, material } of parts) {
                    // Set the attributes for this part, materials aren't used since it's not needed for the shadow map
                    gl.bindVertexArray(vao);
                    twgl.setUniforms(shadowProgramInfo, {
                        u_world,
                        u_lightViewProjection: lightViewProjection
                    });
                    // Calls gl.drawArrays or gl.drawElements
                    twgl.drawBufferInfo(gl, bufferInfo);
                }
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    async function loadObjects() {
        const cubeColor = [1.0, 1.0, 1.0, 1.0]; // white
        const objColors = [
            [ // Tree colors
                [0.0, 1.0, 0.0, 1.0], // Green
                [0.0, 1.0, 0.0, 1.0], // Green
                [0.0, 1.0, 0.0, 1.0], // Green
                [0.0, 1.0, 0.0, 1.0], // Green
                [0.6, 0.3, 0.0, 1.0]  // Brown
            ],
            [ // Dead tree colors
                [0.6, 0.3, 0.0, 1.0]  // Brown
            ],
            [ // Stump colors
                [0.6, 0.3, 0.0, 1.0]  // Brown
            ]
        ];
        
        const cubePath = '/cube.obj';
        const files = [
            [
                'Objects/Low_Poly_Forest_tree01.obj',
                'Objects/Low_Poly_Forest_tree02.obj',
                'Objects/Low_Poly_Forest_treeBlob01.obj',
                'Objects/Low_Poly_Forest_treeBlob02.obj'
            ], // tree
            [
                'Objects/Low_Poly_Forest_tree04.obj',
                'Objects/Low_Poly_Forest_tree05.obj',
                'Objects/Low_Poly_Forest_tree06.obj',
                'Objects/Low_Poly_Forest_tree07.obj',
                'Objects/Low_Poly_Forest_treeRoundTop04.obj',
                'Objects/Low_Poly_Forest_treeRoundTop06.obj' // dead tree  
            ], 
            [
                'Objects/Low_Poly_Forest_treeBlob04.obj',
                'Objects/Low_Poly_Forest_treeTall05.obj',
                'Objects/Low_Poly_Forest_treeTall06.obj'
            ], // tree stump
        ];
    
        const objects = [];
    
        for (let i = 0; i < files.length; i++) {
            const group = [];
            for (let j = 0; j < files[i].length; j++) {
                const randomObjPath = useCube ? cubePath : files[i][j];
                const objColor = useCube ? [cubeColor] : objColors[i];
    
                const objinfo = await loadObjBufferVAO(randomObjPath, objColor);
                group.push(objinfo);
            }
            objects.push(group);
        }
    
        return objects;
    }
    

    function render(time = 1) {
        time *= 0.001;
        gl.enable(gl.DEPTH_TEST);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        const fieldOfViewRadians = degToRad(60);
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

        const up = [0, 1, 0];
        
        // Computing camera matrix
        const cameraPosition = [10000, 3000, 10000]; // camera position
        const cameraTarget = [0, 0, 0]; // looking at center
        const camera = m4.lookAt(cameraPosition, cameraTarget, up);
        const view = m4.inverse(camera);

        // light position and target for shadow map and lighting direction
        const lightPosition = [10000, 10000, 10000];
        const lightTarget = [0, 0, 0];
        const lightViewMatrix = m4.lookAt(lightPosition, lightTarget, [0, 1, 0]);

        // calculate light direction for shading
        const reverseLightDirection = m4.normalize(m4.subtractVectors(lightTarget, lightPosition));

        const left = -10000;
        const right = 10000;
        const bottom = -10000;
        const top = 10000;
        const near = 10;  
        const far = 100000;

        const lightViewProjection = m4.multiply(
            m4.orthographic(left, right, bottom, top, near, far),
            m4.inverse(lightViewMatrix)
        );

        drawShadowScene(time, lightViewProjection, shadowProgramInfo); // Render shadow map
        drawCameraScene(time, projection, view, meshProgramInfo, lightViewProjection, reverseLightDirection); // Render the scene
        //drawShadowMap();
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

    function calculateGrid(baseDistance, density, maxDistance) {
        var grid = [];
        var distance = baseDistance * density;
        var planeSize = (maxDistance + baseDistance) * 2.5;
        var tempCounter = 0;
        var objTypeIndex;
        for (var i = -maxDistance; i <= maxDistance; i += distance) {
            grid.push([]);
            for (var j = -maxDistance; j <= maxDistance; j += distance) {
                objTypeIndex = chooseObject();
                randomx = rng.nextFloat() * (distance / 1.5);
                randomz = rng.nextFloat() * (distance / 1.5);
                grid[tempCounter].push({
                    position: [i + randomx, 0, j + randomz],
                    rotation: rng.nextFloat() * Math.PI * 2,
                    objTypeIndex,
                    objIndex: [Math.floor(rng.nextFloat() * objects[objTypeIndex].length)]
                });
            }
            ++tempCounter;
        }

        return {
            grid, planeSize
        };
    }

    function getSliderValues() {
        const densityValue = parseFloat(document.getElementById('densitySlider').value);
        const treeValue = parseFloat(document.getElementById('treeSlider').value);
        const deadTreeValue = parseFloat(document.getElementById('deadTreeSlider').value);
        const stumpValue = parseFloat(document.getElementById('stumpSlider').value);
        const forestSizeValue = parseFloat(document.getElementById('forestSizeSlider').value);
        
        return {
            forestSizeSlider: forestSizeValue,
            densitySlider: densityValue,
            treeSlider: treeValue,
            stumpSlider: stumpValue,
            deadTreeSlider: deadTreeValue
        };
    }
    // Choose an object based on probabilities
    function chooseObject() {
        const rand = rng.nextFloat();
        let sum = 0;
        for (let i = 0; i < probabilities.length; i++) {
            sum += probabilities[i];
            if (rand < sum) {
                return i;
            }
        }
        return probabilities.length - 1;
    }

    function degToRad(deg) {
        return deg * Math.PI / 180;
    }

    function normalize(array) {
        let sum = 0;
        let normalized_array = [];
        array.forEach(element => {
            sum += element;
        });

        array.forEach(element => {
            normalized_array.push(element / sum);
        });

        return normalized_array;
    }

    function setParameters(sliderValues) {
        var parameters = [sliderValues.treeSlider, sliderValues.deadTreeSlider, sliderValues.stumpSlider];
        probabilities = normalize(parameters); // normalizes all values to add up to 1

        const { grid: new_grid, planeSize: new_planeSize } = calculateGrid(
            baseDistance = 500,
            density = sliderValues.densitySlider,
            maxDistance = sliderValues.forestSizeSlider * 2000
        );

        grid = new_grid;
        planeBufferInfo = twgl.primitives.createPlaneBufferInfo(gl, new_planeSize, new_planeSize);
        planeVao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, planeBufferInfo);
    }

    document.getElementById('slider-container').addEventListener('input', function(event) {
        var sliderValues;
        if (event.target.type === 'range') {
            sliderValues = getSliderValues();
        }

        setParameters(sliderValues);
    });

    // probabilities in order: Tree, dead tree, stump
    var probabilities, planeBufferInfo, planeVao, grid;

    sliderValues = getSliderValues();
    setParameters(sliderValues);
    
    // Camera parameters
    const zNear = 1000; 
    const zFar = 1000000;
    
    render()
}

main();
