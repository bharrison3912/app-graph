////////////////////////////////////////////////////////////////
// global data

var theContext = {};
var ResultTable;

////////////////////////////////////////////////////////////////
// startup
//
$(document).ready(function() {

  // retrieve the query params
  var theQuery = $.getQuery();

  // connect the button
  $("#element-generate").button().click(onGenerate);

  // Hold onto the current session information
  theContext.documentId = theQuery.documentId;
  theContext.workspaceId = theQuery.workspaceId;
  theContext.elementId = theQuery.elementId;
  refreshContextElements();

});


// update the list of elements in the context object
function refreshContextElements() {
  var dfd = $.Deferred();
  // Get all elements for the document ... only send D/W
  var params = "?documentId=" + theContext.documentId + "&workspaceId=" + theContext.workspaceId;
  $.ajax('/api/assemblies'+ params, {
    dataType: 'json',
    type: 'GET',
    success: function(data) {
      // for each assembly tab, create a select option to make that
      // assembly the current context
      $("#elt-select").empty();

      var objects = data;
      var id;

      for (var i = 0; i < objects.length; ++i) {
        $("#elt-select")
            .append(
                    "<option value='" + objects[i].id + "'" +
                    (i == 0 ? " selected" : "") + ">" +
                    objects[i].name + "</option>"
                   )
            .change(function () {
              id = $("#elt-select option:selected").val();
              theContext.elementId = id;
              });
      }
      theContext.elementId = $("#elt-select option:selected").val();
    }
  });
  return dfd.promise();
}

/////////////////////////////////////
//
// Primary BOM generation function
//
var realSize = 0.001;
var tX = 0;
var tY = 0;
var tZ = 0;

function onGenerate() {
  // Destroy anything previously created ...
  $('#bomResults').empty();

  theContext.elementId = $("#elt-select option:selected").val();

  // Get the bounding box size
  $.ajax('/api/boundingBox' + '?documentId=' + theContext.documentId + '&workspaceId=' + theContext.workspaceId + '&elementId=' + theContext.elementId, {
    dataType: 'json',
    type: 'GET',
    success: function(data) {
      var res = data;
      var xLow = res.lowX;
      var xHigh = res.highX;
      var yLow = res.lowY;
      var yHigh = res.highY;
      var zLow = res.lowZ;
      var zHigh = res.highZ;

      // Get the size of the BBox
      var xDiff = xHigh - xLow;
      var yDiff = yHigh - yLow;
      var zDiff = zHigh - zLow;
      realSize = Math.sqrt(xDiff * xDiff + yDiff * yDiff + zDiff * zDiff);

      // Find the center of the BBox - model coordinates
      var xCenter = (xHigh + xLow) / 2;
      var yCenter = (yHigh + yLow) / 2;
      var zCenter = (zHigh + zLow) / 2;

      tX = xCenter * 0.707 + xCenter * -0.409 + xCenter * 0.577;
      tY = yCenter * 0.707 + yCenter * 0.409 + yCenter * -0.577;
      tZ = zCenter * 0 + zCenter * 0.816 + zCenter * 0.577;

      // Now, finish the rest of the work.
      onGenerate2();
    },
    error: function(data) {
      console.log("****** GET BOUNDING BOX - FAILURE - index.js");
    }
  });
}

//
// Keep track of all the components and sub-assemblies we find.
//
var Comp2Array = [];
var SubAsmArray = [];
var ThumbPromises = [];

function generateBBox(elementId, partId) {
  return new Promise(function(resolve, reject) {
    // Get the bounding box size
    $.ajax('/api/boundingBox' + '?documentId=' + theContext.documentId + '&workspaceId=' + theContext.workspaceId + '&elementId=' + elementId + '&partId=' + partId, {
      dataType: 'json',
      type: 'GET',
      success: function(data) {
        var res = data;
        var xLow = res.lowX;
        var xHigh = res.highX;
        var yLow = res.lowY;
        var yHigh = res.highY;
        var zLow = res.lowZ;
        var zHigh = res.highZ;

        // Get the size of the BBox
        var xDiff = xHigh - xLow;
        var yDiff = yHigh - yLow;
        var zDiff = zHigh - zLow;
        bSize = Math.sqrt(xDiff * xDiff + yDiff * yDiff + zDiff * zDiff);

        // Find the center of the BBox - model coordinates
        var xCenter = (xHigh + xLow) / 2;
        var yCenter = (yHigh + yLow) / 2;
        var zCenter = (zHigh + zLow) / 2;

        var bX = xCenter * 0.707 + xCenter * -0.409 + xCenter * 0.577;
        var bY = yCenter * 0.707 + yCenter * 0.409 + yCenter * -0.577;
        var bZ = zCenter * 0 + zCenter * 0.816 + zCenter * 0.577;

        // Now, finish the rest of the work.
        generateThumbs({'Element' : elementId, 'PartId' : partId, 'xCtr' : -bX, 'yCtr' : -bY, 'zCtr' : bZ, 'size' : bSize });
        resolve(1);
      },
      error: function(data) {
        reject(1);
      }
    });
  });
}

var ImagesArray = [];

function generateThumbs(argMap) {
  // Decode the argument map
  var elementId = argMap.Element;
  var partId = argMap.PartId;
  var xCtr = argMap.xCtr;
  var yCtr = argMap.yCtr;
  var zCtr = argMap.zCtr;
  var size = argMap.size;

  // Check to make sure this part/assembly has not been captured already
  var searchPartId = partId;
  if (partId == "NOT")
    searchPartId = 0;
  for (var x = 0; x < ImagesArray.length; ++x) {
    if (ImagesArray[x].Element == elementId && ImagesArray[x].PartId == searchPartId)
      return;
  }

  // Create a promise to sync the generation of the thumbnail
  var thumb = new Promise(function(resolve, reject) {

  // Create the URL for the call to generate the thumbnail with an ISOMETRIC view orientation
  var partIdString = partId;

  var options = "?documentId=" + theContext.documentId + "&workspaceId=" + theContext.workspaceId + "&elementId=" + elementId +
        "&outputHeight=125&outputWidth=125&pixelSize=" + realSize / 125 +
        "&viewMatrix1=" + 0.707 + "&viewMatrix2=" + 0.707 + "&viewMatrix3=" + 0 + "&viewMatrix4=" + xCtr +
        "&viewMatrix5=" + (-0.409) + "&viewMatrix6=" + 0.409 + "&viewMatrix7=" + 0.816 + "&viewMatrix8=" + yCtr +
        "&viewMatrix9=" + 0.577 + "&viewMatrix10=" + (-0.577) + "&viewMatrix11=" + 0.577 + "&viewMatrix12=" + zCtr +
        "&partId=" + partIdString;

  $.ajax('/api/shadedView'+ options, {
      dataType: 'json',
      type: 'GET',
      success: function(data) {
        var res = data;
        if (res.images.length > 0) {
          if (partId == "NOT") {
            ImagesArray[ImagesArray.length] = {
              Image : res.images[0],
              Element : elementId,
              PartId : 0
            };
          }
          else {
            ImagesArray[ImagesArray.length] = {
              Image : res.images[0],
              Element : elementId,
              PartId : partId
            };
          }
        }
        resolve(1);
      },
      error: function() {
        resolve(0);
      }
    });
  });

  ThumbPromises.push(thumb);
}


function findAssemblies(resolve, reject) {
  var params = "?documentId=" + theContext.documentId + "&workspaceId=" + theContext.workspaceId;

  $.ajax('/api/assemblies' + params, {
    dataType: 'json',
    type: 'GET',
    success: function(data) {
      // for each element, create a select option to make that element the current context
      var obj = data;
      var id;
      for (var i = 0; i < obj.length; ++i) {
        // Add this to the list of assemblies
        SubAsmArray[SubAsmArray.length] = {
          Element: obj[i].id,
          Count: 0,
          Handled: false,
          Name : obj[i].name,
          Components : []
        }
      }

      resolve(SubAsmArray);
    },
    error: function() {
      reject("Problem fetching elements");
    }
  });
}

function saveComponentToList(asmIndex, itemName, asmElementId, partElementId, partId) {
  var found = false;
  var foundIndex = 0;
  for (var y = 0; y < SubAsmArray[asmIndex].Components.length; ++y) {
    if (SubAsmArray[asmIndex].Components[y].Name == itemName) {
      SubAsmArray[asmIndex].Components[y].Count++;
      found = true;
      break;
    }
  }

  // If we didn't find an entry for this, add it at the end.
  if (found != true) {
    var nextItem = SubAsmArray[asmIndex].Components.length;
    SubAsmArray[asmIndex].Components[nextItem] = {
      Name: itemName,
      ElementId : partElementId,
      AsmElementId : asmElementId,
      Count: 1,
      PartNumber: 0,
      Revision: 1,
      PartId : partId
    }
  }
}

function findComponents(resolve, reject, nextElement, asmIndex) {
  $.ajax('/api/definition'+ window.location.search + '&nextElement=' + nextElement, {
    dataType: 'json',
    type: 'GET',
    success: function(data) {
      var compData = data;

      // Get the top-level components for this assembly ... gather a list of sub-assemblies to process as well
      for (var i = 0; i < compData.rootAssembly.instances.length; ++i) {

        // If it's a part, then add that to the list
        if (compData.rootAssembly.instances[i].type == "Part") {
          var bracketIndex = compData.rootAssembly.instances[i].name.lastIndexOf("<");
          var itemName = compData.rootAssembly.instances[i].name;
          if (bracketIndex > -1)
            itemName = compData.rootAssembly.instances[i].name.substring(0, bracketIndex - 1);

          // Search through the list of components to find a match
          saveComponentToList(asmIndex, itemName, 0, compData.rootAssembly.instances[i].elementId, compData.rootAssembly.instances[i].partId);
        }

        // If it's a sub-assembly instance, make sure we bump the count properly.
        else if (compData.rootAssembly.instances[i].type == "Assembly") {
            var subElementId = compData.rootAssembly.instances[i].elementId;
            var found = false;
            var asmName;
            for (var n = 0; n < SubAsmArray.length; ++n) {
              if (subElementId == SubAsmArray[n].Element) {
                found = true;
                asmName = SubAsmArray[n].Name;
                break;
              }
            }

            // Save this as a 'component' in the list too
            if (found == true)
              saveComponentToList(asmIndex, asmName, subElementId, 0, 0);
        }
      }

      resolve(asmIndex);
    },
    error: function() {
      reject("Error finding components for assembly");
    }
  });
}

// Second half to the generate function ... need the bounding box results first
function onGenerate2() {
  ImagesArray = [];

// Add an image of the model to the page
  ResultImage = $('<div style="float:right"></div>');
  ResultImage.addClass('ResultImage');

  var options = "?documentId=" + theContext.documentId + "&workspaceId=" + theContext.workspaceId + "&elementId=" + theContext.elementId +
          "&outputHeight=125&outputWidth=125&pixelSize=" + realSize / 125 +
      "&viewMatrix1=" + 0.707 + "&viewMatrix2=" + 0.707 + "&viewMatrix3=" + 0 + "&viewMatrix4=" + (-tX) +
      "&viewMatrix5=" + (-0.409) + "&viewMatrix6=" + 0.409 + "&viewMatrix7=" + 0.816 + "&viewMatrix8=" + (-tY) +
      "&viewMatrix9=" + 0.577 + "&viewMatrix10=" + (-0.577) + "&viewMatrix11=" + 0.577 + "&viewMatrix12=" + (-tZ) +
      "&partId=NOT";

  $.ajax('/api/shadedView'+ options, {
    dataType: 'json',
    type: 'GET',
    success: function(data) {
      var res = data;
      if (res.images.length > 0) {
        var image = res.images[0];
        ResultImage.append("<img alt='shaded view' src='data:image/png;base64," + image + "' />");

        ImagesArray[ImagesArray.length] = {
          Image : image,
          Element : 0,
          PartId : 0
        }
      }
      else {
        imageString = "<img alt='An image' src='http://i.imgur.com/lEyLDtn.jpg' width=550 height=244 />";
        ResultImage.append(imageString);
      }
    },
    error: function() {

    }
  });

  // Recursive search for components in the assembly
  Comp2Array = [];
  SubAsmArray = [];
  ThumbPromises = [];

  var addImage = false;
  var e = document.getElementById("use-images");
  if (e.checked == true)
    addImage = true;

  var getPromise = new Promise(findAssemblies);

  // Find all assemblies in the model
  return getPromise.then(function() {
    var listPromises = [];

    // Find all of the components in the selected assembly (and it's sub-assemblies)
    for (var x = 0; x < SubAsmArray.length; ++x)
      listPromises.push(new Promise(function(resolve, reject) { findComponents(resolve, reject, SubAsmArray[x].Element, x); }));

    return Promise.all(listPromises);
  }).then(function() {
    var bboxPromises = [];

    if (addImage) {
      // Generate all of the thumbnails of the assemblies
      for (var x = 0; x < SubAsmArray.length; ++x) {
        var thumbPromise = generateBBox(SubAsmArray[x].Element, 'NOT');
        bboxPromises.push(thumbPromise);
      }

      // Generate all of the thumbnails for the components found
      for (var y = 0; y < SubAsmArray.length; ++y) {
        for (var z = 0; z < SubAsmArray[y].Components.length; ++z) {
          if (SubAsmArray[y].Components[z].AsmElementId == 0) {
            var partThumbPromise = generateBBox(SubAsmArray[y].Components[z].ElementId, SubAsmArray[y].Components[z].PartId);
            bboxPromises.push(partThumbPromise);
          }
        }
      }
    }

    return Promise.all(bboxPromises);
  }).then(function() {
    // Make sure all of the images are captured
    return Promise.all(ThumbPromises);
  }).then(function() {
    // Match up revision/part number and total counts here
    onGenerate3();
  });

}

//
// Add a component to the master list
//
function addComponentToList(indexI, indexX, levelIn, forceAdd) {
  var found = false;

  if (forceAdd == false) {
    for (var y = 0; y < Comp2Array.length; ++y) {
      if (Comp2Array[y].Name == SubAsmArray[indexI].Components[indexX].Name) {
        Comp2Array[y].Count += SubAsmArray[indexI].Components[indexX].Count;
        found = true;
        break;
      }
    }
  }

  // Add this component to the list
  if (found == false) {
    Comp2Array[Comp2Array.length] = {
      Name : SubAsmArray[indexI].Components[indexX].Name,
      Count : SubAsmArray[indexI].Components[indexX].Count,
      PartNumber : 0,
      Revision : 1,
      Level : levelIn,
      Collapse : false,
      ElementId : SubAsmArray[indexI].Components[indexX].ElementId,
      AsmElementId : 0,
      PartId : SubAsmArray[indexI].Components[indexX].PartId
    }
  }
}

//
// Add the Sub Assembly to the list with the proper count
// Then add all of the components for one instance of the sub-assembly
//
function addSubAssemblyToList(indexI, levelIn, countIn, recurse) {
  // Put on the sub-assembly with the collapse option as TRUE
  Comp2Array[Comp2Array.length] = {
    Name : SubAsmArray[indexI].Name,
    Count : countIn,
    PartNumber : 0,
    Revision : 1,
    Level : levelIn,
    Collapse : true,
    ElementId : 0,
    AsmElementId : SubAsmArray[indexI].Element,
    PartId : 0
  }

  // Now go through and add all of the children components at Level +1 to this one
  for (var x = 0; x < SubAsmArray[indexI].Components.length; ++x) {
    if (SubAsmArray[indexI].Components[x].AsmElementId == 0)
      addComponentToList(indexI, x, levelIn + 1, true);
    else if (recurse == true) {
      // Add sub-assemblies to the tree
      for (var y = 0; y < SubAsmArray.length; ++y) {
        if (SubAsmArray[y].Element == SubAsmArray[indexI].Components[x].AsmElementId)
          addSubAssemblyToList(y, levelIn + 1, SubAsmArray[indexI].Components[x].Count, true);
      }
    }
  }
}

//
// From all of the assemblies, create a list of components by sub-assembly
//
function createTreeList() {
  // Find the top level assembly to start with
  var topLevelAsmIndex = 0;
  for (var x = 0; x < SubAsmArray.length; ++x) {
    if (SubAsmArray[x].Element == theContext.elementId) {
      topLevelAsmIndex = x;
      break;
    }
  }

  // Walk from the top-level assembly
  var currentLevel = 0;
  for (var x = 0; x < SubAsmArray[topLevelAsmIndex].Components.length; ++x) {
    // Find out if this component exists in our flattened list yet
    if (SubAsmArray[topLevelAsmIndex].Components[x].AsmElementId == 0)
      addComponentToList(topLevelAsmIndex, x, currentLevel, false);
    else {
      // Find the sub-assembly to add ...
      for (var y = 0; y < SubAsmArray.length; ++y) {
        if (SubAsmArray[y].Element == SubAsmArray[topLevelAsmIndex].Components[x].AsmElementId)
          addSubAssemblyToList(y, currentLevel, SubAsmArray[topLevelAsmIndex].Components[x].Count, true);
      }
    }
  }
}

function onGenerate3()
{
  // Walk through all of the data collected and build the tree.
  createTreeList();

  // Populate the graph nodes/links with data from the assembly tree
  var nodes = [];
  var links = [];

  var currentComponent = 1;
  var currentTarget = 0;
  var currentSubAssemblyCount = 1;

  var levelStack = [];
  levelStack.push({"target": 0, "subAsmCount": 1});

  // Find the image for the parent node (element == 0)
  var topLevelImage = null;
  for (var i = 0; i < ImagesArray.length; ++i) {
    if (ImagesArray[i].Element == 0) {
      topLevelImage = ImagesArray[i].Image;
    }
  }

  var useImages = false;
  var e = document.getElementById("use-images");
  if (e.checked == true)
    useImages = true;

  var distance = 6;
  if (useImages)
    distance = 62;

  // Add the parent node
  nodes[nodes.length] = {
      "name": "ROOT",
      "group": 0,
      "image": topLevelImage,
      "offset" : distance,
      "charge" : -3000
  };

  // Add the the children now
  for (var z = 0; z < Comp2Array.length; ++z) {
    // See if we should pop the level info
    if (Comp2Array[z].Level < (levelStack.length - 1))
      levelStack.pop();

    var thisTarget = levelStack[levelStack.length - 1].target;
    var thisSubAsmCount = levelStack[levelStack.length - 1].subAsmCount;

    var groupNumber = Comp2Array[z].Level + 1;


    var thisImage = topLevelImage;
    var itemElementId = Comp2Array[z].AsmElementId;
    if (itemElementId == 0)
      itemElementId = Comp2Array[z].ElementId;
    var itemPartId = Comp2Array[z].PartId;

    for (var i = 0; i < ImagesArray.length; ++i) {
      if (ImagesArray[i].Element == itemElementId && ImagesArray[i].PartId == itemPartId) {
        thisImage = ImagesArray[i].Image;
      }
    }

    var nextCharge = (itemPartId == 0) ? -1000 : -100;

    for (var b = 0; b < thisSubAsmCount; ++b) {
      for (var a = 0; a < Comp2Array[z].Count; ++a) {
        var nodeName = Comp2Array[z].Name;
        if (Comp2Array[z].Count > 1)
          nodeName += " <" + (a + 1) + ">";
        nodes[nodes.length] = {
          "name": nodeName,
          "group": Comp2Array[z].Level + 1,
          "image": thisImage,
          "offset" : distance,
          "charge" : nextCharge
        };

        links[links.length] = {
          "source": currentComponent,
          "target": thisTarget + b,
          "value": 1
        };
        currentComponent++;
      }
    }

    // We have a sub-assembly ... need to change the level as well as the target
    if (Comp2Array[z].Collapse == true) {
      levelStack.push({"target": currentComponent - Comp2Array[z].Count, "subAsmCount": Comp2Array[z].Count});
    }
  }

  // Clear out any current results
  d3.select("svg").remove();

  var width = $(window).width(),
      height = $(window).height();

  var color = d3.scale.category20();

  var linkDistance = 75;
  if (useImages) {
    linkDistance = 150;
  }

  var force = d3.layout.force()
      .charge(function(node) { return node.charge; })
      .linkDistance(linkDistance)
      .size([width, height]);

  var svg = d3.select("body").append("svg")
      .attr("width", width)
      .attr("height", height);

  force.nodes(nodes)
       .links(links)
       .start();

  var link = svg.selectAll(".link")
      .data(links)
      .enter().append("line")
      .attr("class", "link")
      .style("stroke-width", function(d) { return Math.sqrt(d.value); });

  // Use Images for each node or a Color-coded circle
  var node;
  if (useImages == false) {
    node = svg.selectAll(".node")
        .data(nodes)
          .enter().append("circle")
          .attr("class", "node")
          .attr("r", 12)
          .style("fill", function(d) { return color(d.group); })
          .call(force.drag);
  }
  else {
    node = svg.selectAll(".node")
        .data(nodes)
        .enter().append("image")
        .attr("class", "node")
        .attr("width", 125)
        .attr("height", 125)
        .attr("xlink:href", function(d) { return ("data:image/png;base64," + d.image); })
        .call(force.drag);
  }

  node.append("title")
      .text(function(d) { return d.name; });

  force.on("tick", function() {
    link.attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    node.attr("cx", function(d) { return d.x; })
        .attr("cy", function(d) { return d.y; });

    if (useImages) {
      svg.selectAll(".node")
          .attr("transform", function (d) {
            return "translate(" + (d.x - d.offset) + "," + (d.y - d.offset) + ") scale(1)";
          });
    }
   });
}
