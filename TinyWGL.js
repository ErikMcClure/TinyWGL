var addEvent = function(elem, type, eventHandle) {
  if (elem == null || elem == undefined) return;
  if (elem.addEventListener) {
    elem.addEventListener(type, eventHandle, false);
  } else if ( elem.attachEvent ) {
    elem.attachEvent("on" + type, eventHandle);
  } else {
    elem["on"+type]=eventHandle;
  }
};
function TinyPass() {
  this.cameraMatrix=Matrix.I(4);
  this.renderables=[];
  this.rendertarget=null;
  this.onDraw = function() {};
  this.customDraw = function() {};
}
function TinyWGL(canvas,zfar,yfov,resizefunc) {
  // Attempt to initialize WebGL
  var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  this.gl = gl; // always assign this so we can check if it's bogus because constructors can't fail
  if(!gl) return null;
  if(!yfov) yfov=60;
  if(!resizefunc) resizefunc = function(canvas) {
    canvas.width=window.innerWidth;
    canvas.height=window.innerHeight;
  }
  
  // Set up function calls
  this.createShader = createShader;
  this.getShader = getShader;
  this.draw = draw;
  this.createVertexBuffer = createVertexBuffer;
  this.createIndexBuffer = createIndexBuffer;
  this.applyShader = applyShader;
  this.setTexture = setTexture;
  this.loadTexture = loadTexture;
  this.defaultTexLoad = defaultTexLoad;
  this.pow2TexLoad = pow2TexLoad;
  this.createRenderTarget=createRenderTarget;
  this.drawRenderable = drawRenderable;
  this.lastshader = null;
  this.lastarraybuffer = null;
  this.lastindexbuffer = null;
  this.needredraw = false;
  this.Mat4x4 = function(v,x) { gl.uniformMatrix4fv(v, false, new Float32Array(x.flatten())); };
  this.Float1 = function(v,x) { gl.uniform1f(v,x); };
  this.Float2 = function(v,x) { gl.uniform2fv(v,new Float32Array(x)); };
  this.Float3 = function(v,x) { gl.uniform3fv(v,new Float32Array(x)); };
  this.Float4 = function(v,x) { gl.uniform4fv(v,new Float32Array(x)); };
  
  // Set up internal variables
  var ref = this;
  this.time = 0.0;
  this.delta = 0.0;
  this.lastTime = (new Date()).getTime();
  this.timeWarp = 1.0;
  this.basicShader = this.createShader("default-shader-fs","default-shader-vs",
    {"PMat" : this.Mat4x4,
     "ModelMat" : this.Mat4x4},
    [["Position",3,0,0]]);
  this.imgShader = this.createShader("texture-shader-fs","texture-shader-vs",
    {"PMat" : this.Mat4x4,
    "ModelMat" : this.Mat4x4,
    "Color" : function(v,x) { ref.Float4(v,!x?[1.0,1.0,1.0,1.0]:x); },
    "s0" : function(v,x){ ref.setTexture(v,x); } },
    [["Position",3,20,0],["TexCoord",2,20,12]]);
    
  this.identity = Matrix.I(4);
  this.perspectiveMatrix = this.identity;
  this.perspectiveCameraMatrix=this.identity;
  this.pass = [new TinyPass()];
  
  this.imgIndices=this.createIndexBuffer([0,1,3,0,2,3]);
  
  var v = [];
  for(var i = 0; i < 4; ++i)
  {
    v[i*5]=(i&1);
    v[i*5+1]=-((i&2)>>1);
    v[i*5+2]=-1;
    v[i*5+3]=(i&1);
    v[i*5+4]=(i&2)>>1;
  }
  this.imgVerts = this.createVertexBuffer(v, 5);
  
  // Setup WebGL and the window.
  gl.clearColor(0.0, 0.0, 0.0, 1.0); 
  gl.enable(gl.DEPTH_TEST);  
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthFunc(gl.LEQUAL);
  var on_resize = function(event) {
    resizefunc(canvas);
    ref.canvaswidth=canvas.width;
    ref.canvasheight=canvas.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
    ref.perspectiveMatrix = makePerspective(yfov, canvas.width/canvas.height, 0.1, zfar);
    ref.needredraw=true;
    ref.hfov=2*Math.atan(Math.tan(yfov*Math.PI/360)*canvas.width/canvas.height);
  };
  addEvent(window,"resize", on_resize);
  
  window.requestAnimFrame = (function(){
  return window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      function( callback ){
          window.setTimeout(callback, 1000 / 60);
      };
  })();
    
  on_resize({});
}
function drawRenderable(type, shader, verts, indices, params) {
  var gl = this.gl;
  for(var p in shader.props) {
    shader.props[p](shader.propLoc[p],params[p])
  }
  if(!indices) {
    gl.drawArrays(type, 0, verts.count);
  } else {
    if(this.lastindexbuffer != indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lastindexbuffer = indices);
    }
    gl.drawElements(type, indices.count, gl.UNSIGNED_SHORT, 0);
  }
}
function createShader(ps,vs, props, attributes) {
  var gl = this.gl;
  var fShader = this.getShader(ps);
  var vShader = this.getShader(vs);
  
  var shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vShader);
  gl.attachShader(shaderProgram, fShader);
  gl.linkProgram(shaderProgram);
  
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize the shader program.");
  }
        
  shaderProgram.props=props;
  shaderProgram.attributes=attributes;
  for(var i = 0; i < shaderProgram.attributes.length; i++) {
    shaderProgram.attributes[i][0] = gl.getAttribLocation(shaderProgram, shaderProgram.attributes[i][0]);
  }
  shaderProgram.propLoc={};
  for(var p in shaderProgram.props) {
    shaderProgram.propLoc[p]=gl.getUniformLocation(shaderProgram, p);
  }
  
  return shaderProgram;
};
function getShader(id) {
  var gl = this.gl;
  var shaderScript = document.getElementById(id);
  if (!shaderScript) {
    return null;
  }

  var str = "";
  var k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }

  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, str);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}
function defaultTexLoad(img,tex) { // works for all texture sizes
  var gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
function pow2TexLoad(img,tex) { // only works for power of two size textures
  var gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
function loadTexture(path, onload) {
  var tex = this.gl.createTexture();
  var img = new Image();
  var ref=this;
  img.onload = (!onload)?function(){ref.defaultTexLoad(img,tex);}:function(){onload(img,tex);};
  img.src=path;
  return tex;
}
function setTexture(uniform,tex,cur) {
  var gl=this.gl;
  if(!cur) cur=0;
  gl.activeTexture(gl["TEXTURE"+cur]); // gl.TEXTURE0
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(uniform, cur);  
}
function createRenderTarget(w,h) {
  var gl = this.gl;
  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  fb.width = !w?this.canvaswidth:w;
  fb.height = !h?this.canvasheight:h;
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fb.width, fb.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  var rbuf = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rbuf);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fb.width, fb.height);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rbuf);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {"rt" : fb, "tex" : tex, "renderbuffer" : rbuf};
}
function createVertexBuffer(vertices, elem) {
  if(!elem || (~~(vertices.length%elem)) != 0) {
    alert("vertices.length % elem is not zero! Elem should be the size of each vertex (the number of coordinates in it).");
  }
  var gl=this.gl;
  var r = gl.createBuffer();
  r.elem = ~~elem;
  r.count = ~~(vertices.length/elem);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.lastarraybuffer=r);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return r;
}
function createIndexBuffer(indices) {
  var gl=this.gl;
  var r = gl.createBuffer();
  r.count = indices.length;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lastindexbuffer=r);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  return r;
} 
function applyShader(shader,verts) {
  var gl = this.gl;
  if(shader!=this.lastshader) {
    if(this.lastshader != null && this.lastshader.attributes.length != shader.attributes.length) {
      for(var i = 0; i < this.lastshader.attributes.length; i++) {
        gl.disableVertexAttribArray(this.lastshader.attributes[i][0]);
      }
    }
    if(this.lastshader == null || this.lastshader.attributes.length != shader.attributes.length) {
      for(var i = 0; i < shader.attributes.length; i++) {
        gl.enableVertexAttribArray(shader.attributes[i][0]);
      }
    }
    gl.useProgram(this.lastshader=shader);
  }
  if(verts!=this.lastarraybuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lastarraybuffer=verts);
  for(var i = 0; i < shader.attributes.length; i++) {
    var attr = shader.attributes[i];
    gl.vertexAttribPointer(attr[0], attr[1], gl.FLOAT, false, attr[2], attr[3]);  
  }
}
function draw() {
  var gl=this.gl;
  var ref=this;
  window.requestAnimFrame(function(){ ref.draw() });
  var timeNow = (new Date()).getTime();
  this.delta = timeNow - this.lastTime;
  this.delta *= this.timeWarp;
  this.time += this.delta;
  this.lastTime = timeNow;
  
  if(this.timeWarp===0.0 && !this.needredraw) return;
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  this.needredraw=false;
  
  for(var j = 0; j < this.pass.length; j++) {
    var pass=this.pass[j];
    pass.onDraw();
    this.perspectiveCameraMatrix = this.perspectiveMatrix.x(pass.cameraMatrix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pass.rendertarget);
    pass.customDraw();
    
    for(var i = 0; i < pass.renderables.length; i++) {
      var r = pass.renderables[i];
      if(!r.render(this)) {
        ref.applyShader(r.shader, r.verts);
        ref.drawRenderable(r.type, r.shader, r.verts, r.indices, r.params);
      }
    }
  }
}
function TinyRenderable(type, shader, verts, indices, params, renderfunc) {
  this.type = type;
  this.shader = shader;
  this.verts = verts;
  this.indices = indices;
  this.params = params;
  if(renderfunc == null) renderfunc = function() {};
  this.render = renderfunc;
}
function TinyImage(path,tinywgl,shader,pow2) {
  if(typeof path === 'string') path = [path];
  if(!shader) shader = tinywgl.imgShader;
  
  var params={"ModelMat" : Matrix.I(4)};
  for(var i = 0; i < path.length; ++i) {
    params["s"+i] = tinywgl.loadTexture(path[i],!pow2?0:function(img,tex){tinywgl.pow2TexLoad(img,tex);});
  }
  
  TinyRenderable.call(this, tinywgl.gl.TRIANGLES, shader, tinywgl.imgVerts, tinywgl.imgIndices, params, function(wgl) { this.params["PMat"] = tinywgl.perspectiveCameraMatrix; })
}
function FullScreenQuad(tex,tinywgl) {
  var v = [];
  for(var i = 0; i < 4; ++i)
  {
    v[i*5]=((i&1)<<1) - 1;
    v[i*5+1]=-((i&2) - 1);
    v[i*5+2]=0;
    v[i*5+3]=(i&1);
    v[i*5+4]=(i&2)>>1;
  }
  TinyRenderable.call(this, tinywgl.gl.TRIANGLES, tinywgl.imgShader, tinywgl.createVertexBuffer(v, 5), tinywgl.imgIndices, {"PMat" : Matrix.I(4), "ModelMat" : Matrix.I(4), "s0" : tex });
}
