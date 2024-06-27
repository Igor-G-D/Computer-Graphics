// WebGL2 - 2D Geometry Matrix Transform with Projection
// from https://webgl2fundamentals.org/webgl/webgl-2d-geometry-matrix-transform-simpler-functions.html

"use strict";

var vertexShaderSource = `#version 300 es

// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec2 a_position;

// A matrix to transform the positions by
uniform mat3 u_matrix;

// all shaders have a main function
void main() {
  // Multiply the position by the matrix.
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}
`;

var fragmentShaderSource = `#version 300 es

precision highp float;

uniform vec4 u_color;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
  outColor = u_color;
}
`;

let animationPlaying = false;

function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  var canvas = document.querySelector("#canvas");
  var gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

  var timers = document.querySelectorAll('.time');
  var movementDirections = [1, 1, 1]; // positive at first
  const durations = [2000, 4000, 6000];
  var zeros = [];
  var matrices = [];
  var transformations = [];
  const numberOfPointsArray = [18, 12, 18]; // Points for F, L, H respectively
  const setGeometryFunctions = [setGeometryF, setGeometryL, setGeometryH];

  for (var i = 0; i < setGeometryFunctions.length; i++) {
    var matrix = m3.projection(gl.canvas.clientWidth, gl.canvas.clientHeight);
    matrices.push(matrix);

    var transformation = {
      translation: [100, 0],
      rotationInRadians: 0,
      scale: [1, 1],
      color: [Math.random(), Math.random(), Math.random(), 1]
    };

    transformations.push(transformation);
  }

  // Use our boilerplate utils to compile the shaders and link into a program
  var program = webglUtils.createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource]);

  // look up where the vertex data needs to go.
  var positionAttributeLocation = gl.getAttribLocation(program, "a_position");

  // look up uniform locations
  var colorLocation = gl.getUniformLocation(program, "u_color");
  var matrixLocation = gl.getUniformLocation(program, "u_matrix");

  // Create a buffer
  var positionBuffer = gl.createBuffer();

  // Create a vertex array object (attribute state)
  var vao = gl.createVertexArray();

  // and make it the one we're currently working with
  gl.bindVertexArray(vao);

  // Turn on the attribute
  gl.enableVertexAttribArray(positionAttributeLocation);

  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  var size = 2; // 2 components per iteration
  var type = gl.FLOAT; // the data is 32bit floats
  var normalize = false; // don't normalize the data
  var stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
  var offset = 0; // start at the beginning of the buffer
  gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

  drawScene();

  function drawScene() {
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);

    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Clear the canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);

    // Bind the attribute/buffer set we want.
    gl.bindVertexArray(vao);

    var x_offset = 0;
    for (var i = 0; i < setGeometryFunctions.length; i++) {
      // Set the color.
      gl.uniform4fv(colorLocation, transformations[i].color);

      // Reset the matrix to the projection matrix
      matrices[i] = m3.projection(gl.canvas.clientWidth, gl.canvas.clientHeight);

      // Apply the transformations
      matrices[i] = m3.translate(matrices[i], transformations[i].translation[0] + x_offset, transformations[i].translation[1]);
      matrices[i] = m3.rotate(matrices[i], transformations[i].rotationInRadians);
      matrices[i] = m3.scale(matrices[i], transformations[i].scale[0], transformations[i].scale[1]);

      // Set the matrix.
      gl.uniformMatrix3fv(matrixLocation, false, matrices[i]);

      // Set which letter is being drawn
      setGeometryFunctions[i](gl, 150, 150);

      // Draw the geometry
      var primitiveType = gl.TRIANGLES;
      gl.drawArrays(primitiveType, offset, numberOfPointsArray[i]);

      x_offset += 300;
    }
  }

  function firstFrame(timeStamp) {
    for (var i = 0; i < setGeometryFunctions.length; i++) {
      zeros.push(timeStamp);
    }
    requestAnimationFrame(updatePosition);
  }
  
  
  
  function updatePosition(timeStamp) {
    for (var i = 0; i < setGeometryFunctions.length; i++) {
      var letterHeight = 150 //* transformations[i].scale[1];
      if (transformations[i].translation[1] > canvas.height - letterHeight || transformations[i].translation[1] < 0) {
        movementDirections[i] *= -1;
        zeros[i] = timeStamp;
      }

      const progress = (timeStamp - zeros[i]) / durations[i];

      if (movementDirections[i] == 1) {
        transformations[i].translation[1] = (canvas.height - letterHeight) * progress;
        transformations[i].rotationInRadians = 2 * Math.PI * progress;
        
      } else {
        transformations[i].translation[1] = (canvas.height - letterHeight) - (canvas.height - letterHeight) * progress;
        transformations[i].rotationInRadians = -2 * Math.PI * progress;
      }
      
      if (progress <= 0.5) {
        // Grow until 0.5 progress
        var scaleProgress = progress * 2; // Scale progress from 0 to 1
        var scale = 1 + scaleProgress * 0.5; // Scale from 1 to 1.5
      } else {
        // Shrink back after 0.5 progress
        var scaleProgress = (1 - progress) * 2; // Scale progress from 1 to 0
        var scale = 1 + scaleProgress * 0.5; // Scale from 1.5 to 1
      }
      
      transformations[i].scale = [scale, scale];
      
      
      
      timers[i].textContent = ((timeStamp - zeros[i]) * 0.001).toFixed(1) + "s"
    }
    drawScene();

    requestAnimationFrame(updatePosition);
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === "ArrowRight" && animationPlaying == false) {
      animationPlaying = true;
      requestAnimationFrame(firstFrame);
    }
  });
}

function setGeometryF(gl, width, height) {
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      // left column
      0, 0,
      30, 0,
      0, 150,
      0, 150,
      30, 0,
      30, 150,

      // top rung
      30, 0,
      100, 0,
      30, 30,
      30, 30,
      100, 0,
      100, 30,

      // middle rung
      30, 60,
      67, 60,
      30, 90,
      30, 90,
      67, 60,
      67, 90,
    ]),
    gl.STATIC_DRAW
  );
}

// Fill the current ARRAY_BUFFER buffer
// with the values that define a letter 'L'.
function setGeometryL(gl) {
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      // left column
      0, 0,
      30, 0,
      0, 150,
      0, 150,
      30, 0,
      30, 150,

      // bottom rung
      30, 150,
      100, 150,
      30, 120,
      30, 120,
      100, 150,
      100, 120,
    ]),
    gl.STATIC_DRAW
  );
}

// Fill the current ARRAY_BUFFER buffer
// with the values that define a letter 'H'.
function setGeometryH(gl) {
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      // left column
      0, 0,
      30, 0,
      0, 150,
      0, 150,
      30, 0,
      30, 150,

      // right column
      70, 0,
      100, 0,
      70, 150,
      70, 150,
      100, 0,
      100, 150,

      // middle rung
      30, 60,
      70, 60,
      30, 90,
      30, 90,
      70, 60,
      70, 90,
    ]),
    gl.STATIC_DRAW
  );
}

var m3 = {
  projection: function projection(width, height) {
    // Note: This matrix flips the Y axis so that 0 is at the top.
    return [
      2 / width, 0, 0,
      0, -2 / height, 0,
      -1, 1, 1,
    ];
  },

  translation: function translation(tx, ty) {
    return [
      1, 0, 0,
      0, 1, 0,
      tx, ty, 1,
    ];
  },

  rotation: function rotation(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);
    return [
      c, -s, 0,
      s, c, 0,
      0, 0, 1,
    ];
  },

  scaling: function scaling(sx, sy) {
    return [
      sx, 0, 0,
      0, sy, 0,
      0, 0, 1,
    ];
  },

  multiply: function multiply(a, b) {
    var a00 = a[0 * 3 + 0];
    var a01 = a[0 * 3 + 1];
    var a02 = a[0 * 3 + 2];
    var a10 = a[1 * 3 + 0];
    var a11 = a[1 * 3 + 1];
    var a12 = a[1 * 3 + 2];
    var a20 = a[2 * 3 + 0];
    var a21 = a[2 * 3 + 1];
    var a22 = a[2 * 3 + 2];
    var b00 = b[0 * 3 + 0];
    var b01 = b[0 * 3 + 1];
    var b02 = b[0 * 3 + 2];
    var b10 = b[1 * 3 + 0];
    var b11 = b[1 * 3 + 1];
    var b12 = b[1 * 3 + 2];
    var b20 = b[2 * 3 + 0];
    var b21 = b[2 * 3 + 1];
    var b22 = b[2 * 3 + 2];
    return [
      b00 * a00 + b01 * a10 + b02 * a20,
      b00 * a01 + b01 * a11 + b02 * a21,
      b00 * a02 + b01 * a12 + b02 * a22,
      b10 * a00 + b11 * a10 + b12 * a20,
      b10 * a01 + b11 * a11 + b12 * a21,
      b10 * a02 + b11 * a12 + b12 * a22,
      b20 * a00 + b21 * a10 + b22 * a20,
      b20 * a01 + b21 * a11 + b22 * a21,
      b20 * a02 + b21 * a12 + b22 * a22,
    ];
  },

  translate: function(m, tx, ty) {
    return m3.multiply(m, m3.translation(tx, ty));
  },

  rotate: function(m, angleInRadians) {
    return m3.multiply(m, m3.rotation(angleInRadians));
  },

  scale: function(m, sx, sy) {
    return m3.multiply(m, m3.scaling(sx, sy));
  },
};

main();