// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//     You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//     See the License for the specific language governing permissions and
// limitations under the License.

(function(scope, testing) {
  var composeMatrix = (function() {
    function multiply(a, b) {
      var result = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
          for (var k = 0; k < 4; k++) {
            result[i][j] += b[i][k] * a[k][j];
          }
        }
      }
      return result;
    }

    function is2D(m) {
      return (
          m[0][2] == 0 &&
          m[0][3] == 0 &&
          m[1][2] == 0 &&
          m[1][3] == 0 &&
          m[2][0] == 0 &&
          m[2][1] == 0 &&
          m[2][2] == 1 &&
          m[2][3] == 0 &&
          m[3][2] == 0 &&
          m[3][3] == 1);
    }

    function composeMatrix(translate, scale, skew, quat, perspective) {
      var matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

      for (var i = 0; i < 4; i++) {
        matrix[i][3] = perspective[i];
      }

      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          matrix[3][i] += translate[j] * matrix[j][i];
        }
      }

      var x = quat[0], y = quat[1], z = quat[2], w = quat[3];

      var rotMatrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

      rotMatrix[0][0] = 1 - 2 * (y * y + z * z);
      rotMatrix[0][1] = 2 * (x * y - z * w);
      rotMatrix[0][2] = 2 * (x * z + y * w);
      rotMatrix[1][0] = 2 * (x * y + z * w);
      rotMatrix[1][1] = 1 - 2 * (x * x + z * z);
      rotMatrix[1][2] = 2 * (y * z - x * w);
      rotMatrix[2][0] = 2 * (x * z - y * w);
      rotMatrix[2][1] = 2 * (y * z + x * w);
      rotMatrix[2][2] = 1 - 2 * (x * x + y * y);

      matrix = multiply(matrix, rotMatrix);

      var temp = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
      if (skew[2]) {
        temp[2][1] = skew[2];
        matrix = multiply(matrix, temp);
      }

      if (skew[1]) {
        temp[2][1] = 0;
        temp[2][0] = skew[0];
        matrix = multiply(matrix, temp);
      }

      if (skew[0]) {
        temp[2][0] = 0;
        temp[1][0] = skew[0];
        matrix = multiply(matrix, temp);
      }

      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          matrix[i][j] *= scale[i];
        }
      }

      if (is2D(matrix)) {
        return {
          t: 'matrix',
          d: [matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1],
              matrix[3][0], matrix[3][1]]
        };
      }
      return {
        t: 'matrix3d',
        d: matrix[0].concat(matrix[1], matrix[2], matrix[3])
      };
    }
    return composeMatrix;
  })();

  var clamp = function(x, min, max) {
    return Math.max(Math.min(x, max), min);
  };

  var isDefined = function(val) {
    return typeof val !== 'undefined';
  };

  var isDefinedAndNotNull = function(val) {
    return isDefined(val) && (val !== null);
  };

  // FIXME: This is just a stopgap. Look at the real function from the old polyfill.
  // function interp(from, to, f) { return interpolate(from, to, f); }
  var interp = function(from, to, f, type) {
    if (Array.isArray(from) || Array.isArray(to)) {
      return interpArray(from, to, f, type);
    }
    var zero = (type && type.indexOf('scale') === 0) ? 1 : 0;
    to = isDefinedAndNotNull(to) ? to : zero;
    from = isDefinedAndNotNull(from) ? from : zero;

    return to * f + from * (1 - f);
  };

  var interpArray = function(from, to, f, type) {
    // ASSERT_ENABLED && assert(
    //     Array.isArray(from) || from === null,
    //     'From is not an array or null');
    // ASSERT_ENABLED && assert(
    //     Array.isArray(to) || to === null,
    //     'To is not an array or null');
    // ASSERT_ENABLED && assert(
    //     from === null || to === null || from.length === to.length,
    //     'Arrays differ in length ' + from + ' : ' + to);
    var length = from ? from.length : to.length;

    var result = [];
    for (var i = 0; i < length; i++) {
      result[i] = interp(from ? from[i] : null, to ? to[i] : null, f, type);
    }
    return result;
  };

  function interpolateDecomposedTransformsWithMatrices(fromM, toM, f) {
    // console.log("FromM:");
    // console.log(fromM);
    // console.log("ToM:");
    // console.log(toM);
    var product = scope.dot(fromM.quaternion, toM.quaternion);
    product = clamp(product, -1.0, 1.0);

    var quat = [];
    if (product === 1.0) {
      quat = fromM.quaternion;
    } else {
      var theta = Math.acos(product);
      var w = Math.sin(f * theta) * 1 / Math.sqrt(1 - product * product);

      for (var i = 0; i < 4; i++) {
        quat.push(fromM.quaternion[i] * (Math.cos(f * theta) - product * w) +
                  toM.quaternion[i] * w);
      }
    }

    var translate = interp(fromM.translate, toM.translate, f);
    var scale = interp(fromM.scale, toM.scale, f);
    var skew = interp(fromM.skew, toM.skew, f);
    var perspective = interp(fromM.perspective, toM.perspective, f);

    return composeMatrix(translate, scale, skew, quat, perspective);
  }

  function interpTransformValue(from, to, f) {
    var type = from.t ? from.t : to.t;
    switch (type) {
      case 'matrix':
      case 'matrix3d':
        // ASSERT_ENABLED && assert(false,
        //     'Must use matrix decomposition when interpolating raw matrices');
      // Transforms with unitless parameters.
      case 'rotate':
      case 'rotateX':
      case 'rotateY':
      case 'rotateZ':
      case 'rotate3d':
      case 'scale':
      case 'scaleX':
      case 'scaleY':
      case 'scaleZ':
      case 'scale3d':
      case 'skew':
      case 'skewX':
      case 'skewY':
        return {t: type, d: interp(from.d, to.d, f, type)};
      default:
        // Transforms with lengthType parameters.
        var result = [];
        var maxVal;
        if (from.d && to.d) {
          maxVal = Math.max(from.d.length, to.d.length);
        } else if (from.d) {
          maxVal = from.d.length;
        } else {
          maxVal = to.d.length;
        }
        for (var j = 0; j < maxVal; j++) {
          var fromVal = from.d ? from.d[j] : {};
          var toVal = to.d ? to.d[j] : {};
          result.push(interpolate(fromVal, toVal, f));
        }
        return {t: type, d: result};
    }
  }

  function isMatrix(item) {
    return item.t[0] === 'm';
  }

  function interpolate(from, to, f) {
    if ((typeof from == 'number') && (typeof to == 'number')) {
      return from * (1 - f) + to * f;
    }
    if ((typeof from == 'boolean') && (typeof to == 'boolean')) {
      return f < 0.5 ? from : to;
    }

    // FIXME: Testing that 't' is defined might not be the best way to check that the argument is a
    // transform function.
    if (from[0].t && to[0].t) {
      var out = [];
      // console.log('from');
      // console.log(from);
      // console.log('to');
      // console.log(to);
      // FIXME: What happens if there is a mix of functions and matrices?
      for (var i = 0; i < Math.min(from.length, to.length); i++) {
        if (from[i].t !== to[i].t || isMatrix(from[i])) {
          break;
        }
        out.push(interpTransformValue(from[i], to[i], f));
      }

      if (i < Math.min(from.length, to.length) ||
          from.some(isMatrix) || to.some(isMatrix)) {
        out.push(interpolateDecomposedTransformsWithMatrices(
            from[i].d, to[i].d, f));
        return out;
      }

      for (; i < from.length; i++) {
        out.push(interpTransformValue(from[i], {t: null, d: null}, f));
      }
      for (; i < to.length; i++) {
        out.push(interpTransformValue({t: null, d: null}, to[i], f));
      }
      return out;
    }

    if (from.length == to.length) {
      var out = [];
      for (var i = 0; i < from.length; i++) {
        out.push(interpolate(from[i], to[i], f));
      }
      return out;
    }
    throw 'Mismatched interpolation arguments ' + from + ':' + to;
  }

  scope.Interpolation = function(from, to, convertToString) {
    return function(f) {
      return convertToString(interpolate(from, to, f));
    }
  };

  if (WEB_ANIMATIONS_TESTING) {
    testing.interpolate = interpolate;
  }

})(webAnimationsMinifill, webAnimationsTesting);
