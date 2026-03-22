// ╒═════════════╕
//    VARIABLES
// ╘═════════════╛

// WEBSOCKET SETUP
// --------------------
var socket = io();


// SETTINGS
// --------------------
var cellSize = 60;      // how many pixels wide/tall each grid square is
var MAX_MOVES = 6;      // how many squares a piece is allowed to move per turn
// COLS and ROWS get calculated in resizeCanvas() based on screen size, so for now they're 0
var COLS = 0;
var ROWS = 0;


// BACKGROUND IMAGE
// ---------------------
var bgImage = null;     // will hold the Image object once the user uploads one
var bgScale = 1.0;      // zoom level for the background image


// PLAYER PIECES
// ---------------------
// gridX and gridY are the column and row the piece is sitting on (starts at 2,2 to make aiming the piece easier for my sanity)
var tokens = 
[
    { gridX: 2, gridY: 2, color: "crimson" } // Start with one default token, at 2,2, colored red
];
// Global variable for Croppie
var croppieInstance = null;


// DRAG STATE
// ---------------------
// This tracks everything about the current dragged piece
var drag = 
{
    active: false,      // Is the player currently dragging? (boolean)
    targetIndex: -1,    // ADDED: tracks which token in the list being dragged
    startGX: 0,         // Column (x-coord) where the drag started
    startGY: 0,         // Row (y-coord) where the drag started
    visitedCells: []    // List of every cell the piece has passed through this drag
    // each item looks like this: { x: col, y: row }
};


// CANVAS SETUP
// ---------------------
// Sets up the Javascript Canvas stuff
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");





// ╒════════════════════════════════════════════════════════════════╕
//    FUNCTION: RESIZE CANVAS
//      > Makes the canvas fill the space below the controls bar.
//      > Called on page load and whenever the window is resized.
// ╘════════════════════════════════════════════════════════════════╛

function resizeCanvas() {
    // Figure out how tall the controls bar is
    var controlsBar = document.getElementById("controls");
    var cbH = controlsBar.offsetHeight; // cbH = Control Bar Height

    var availableWidth = window.innerWidth;
    var availableHeight = window.innerHeight - cbH;

    // Only use whole cells so there's never a partial square at the edge of the screen
    // (Calculated using screen resolution)
    COLS = Math.floor(availableWidth / cellSize);
    ROWS = Math.floor(availableHeight / cellSize);

    // Set the canvas pixel size to exactly fit those cells
    canvas.width = COLS * cellSize;
    canvas.height = ROWS * cellSize;

    // Move the canvas down below the controls bar
    canvas.style.top = cbH + "px";
    canvas.style.left = "0px";

    // If the grid shrinks, make sure the player pieces didn't end up outside it
    for (var i = 0; i < tokens.length; i++) 
    {
        if (tokens[i].gridX > COLS - 1) { tokens[i].gridX = COLS - 1; }
        if (tokens[i].gridY > ROWS - 1) { tokens[i].gridY = ROWS - 1; }
    }
}




// ╒════════════════════════════════════╕
//        HELPERS FOR COORDINATES
// ╘════════════════════════════════════╛

// Converts a screen position (like from a mouse/touch event) into grid column + row
// Returns null if the position is outside the JS canvas area
function pageToGrid(pageX, pageY) 
{
    var rect = canvas.getBoundingClientRect(); // Bounding coordinates

    // Position relative to the canvas top-left corner
    // .left and .top are the same as style.left and style.top etc
    var x = pageX - rect.left;
    var y = pageY - rect.top;

    // Exit function if outside the canvas area
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) 
    {
        return null;
    }

    // idk why I can't have the { on a new line and its bothering me but if I do VSC yells at me
    return { // Return coordinates {x, y}
        gx: Math.floor(x / cellSize),
        gy: Math.floor(y / cellSize)
    };
}

// Returns the pixel coordinates of the center of a given grid cell
// Useful for drawing things in the middle of a square (AKA the player token pieces)
function cellCenter(gx, gy) 
{
    return {
        cx: gx * cellSize + cellSize / 2,
        cy: gy * cellSize + cellSize / 2
    };
}




// ╒════════════════════════════════════════════════════════════════╕
//    FUNCTIONS: DRAG LOGIC/HELPERS
//      > Tracks down, drag, and stop 'gestures'
//      > Kind of like event listeners but not lol
//      > All of them call 'updateMoveInfo' except for 'up' gesture
// ╘════════════════════════════════════════════════════════════════╛

// Called when the player presses down on the canvas (touches screen)
// Only starts a drag if directly on the player piece -- touching anywhere else does nothing
function onPointerDown(pageX, pageY) 
{
    var cell = pageToGrid(pageX, pageY);
    if (cell == null)  // If cell does not exit, blow up
        { 
            return; 
        }

    for (var i = 0; i < tokens.length; i++) // ADDED: Loop for detecting which token is being touched
        { 
        // Check if the touch landed on the player's current cell
        if (cell.gx == tokens[i].gridX && cell.gy == tokens[i].gridY) 
            {
            drag.active = true;
            drag.targetIndex = i; // Stores the index of the grabbed token for later
            drag.startGX = tokens[i].gridX;
            drag.startGY = tokens[i].gridY;

            // The starting cell goes in the list but doesn't count as a move
            drag.visitedCells = [{ x: tokens[i].gridX, y: tokens[i].gridY }];

            updateMoveInfo();
            render();
            return; // Exits the loop once a match is found (don't keep going)
        }
    }
    render();
}

// Called while the player moves their finger during a drag.
// Moves the piece (player icon) to the new cell and tracks how many squares have been used.
function onPointerMove(pageX, pageY) 
{

    var currentToken = tokens[drag.targetIndex]; // Use the index saved from onPointerDown
    var cell = pageToGrid(pageX, pageY);
    var gx = cell.gx; // Storage for this function's grid x coordinate
    var gy = cell.gy; // Storage for this function's grid x coordinate

    // --- EXIT CHECKS ---
    if (!drag.active)  // If drag has stopped, exit function
        { 
            return; 
        }

    if (cell == null) // If cell trying to travel to does not exist, exit function
        { 
            return; 
        } 

    // If already on this cell, nothing to do
    if (gx == currentToken.gridX && gy == currentToken.gridY) 
        { 
            return; 
        }


    // Check if the player is backtracking over a cell they already visited
    // If so, "undo" moves back to that point instead of adding new ones
    var foundAt = -1; // Placeholder value; if it changes from this impossible value (since indexes can't be negative), then that means player backtracked
    for (var i = 0; i < drag.visitedCells.length; i++) 
    {
        if (drag.visitedCells[i].x == gx && drag.visitedCells[i].y == gy) // If this function's X AND Y coordinate match a visited cell's coordinates in the token's array, update foundAt to no longer be -1
        {
            foundAt = i;
            break;
        }
    }

    if (foundAt != -1)  // If the foundAt variable is positive (from function above), that means the player backtracked, so...
    {
        // Trim the list back to the cell player backtracked to
        drag.visitedCells = drag.visitedCells.slice(0, foundAt + 1);
        currentToken.gridX = gx;
        currentToken.gridY = gy;
        updateMoveInfo();
        render();
        return;
    }

    // If the above if statement doesn't execute, then player is at a brand new cell -- check if there's any movement budget left
    // (visitedCells[0] is the start, so moves used = length - 1)
    var movesUsed = drag.visitedCells.length - 1;
    if (movesUsed >= MAX_MOVES) 
    {
        return; // Out of moves, don't allow this step (womp womp)
    }

    // Movement is allowed, add the cell and update the piece position
    drag.visitedCells.push({ x: gx, y: gy });
    currentToken.gridX = gx;
    currentToken.gridY = gy;

    // Hey server machine! Sync that shit!
    socket.emit('tokenMove', {
        index: drag.targetIndex,
        x: gx,
        y: gy
    });

    updateMoveInfo();
    render();
}

// Called when the player lifts their finger/mouse
// Ends the drag and keeps the trail visible until a new movement is done (or turn ends)
function onPointerUp() 
{
    if (!drag.active) 
        { 
            return; 
        }
    drag.active = false;
    render();
}




// ╒════════════════════════════════════════════════════════╕
//    FUNCTIONS: UI HELPERS
//      > Updates move info in top right corner
//      > Deals with "add token" logic
// ╘════════════════════════════════════════════════════════╛

// Updates the "Movement: X / 6 squares" text in the controls bar
function updateMoveInfo() {
    var movesUsed = 0;
    if (drag.active) 
    {
        movesUsed = drag.visitedCells.length - 1;
    }
    document.getElementById("movementInfo").textContent = "Movement: " + movesUsed + " / " + MAX_MOVES + " squares";
}

// Helper function to create the player token object
function spawnToken(tokenInfo) 
{
    var newToken = {
        gridX: 1,
        gridY: 1,
        type: tokenInfo.type,
        color: tokenInfo.color || "white",
        imgData: tokenInfo.imgData || null,
        imgTag: null // This will hold the actual Image object
    };

    // If it's an image, we need to convert the text (base64) into an actual Image object
    if (newToken.type === 'image') 
    {
        var img = new Image();
        img.onload = function() { render(); };
        img.src = newToken.imgData;
        newToken.imgTag = img;
    }

    tokens.push(newToken);
    socket.emit('newToken', newToken); 
    render();
}




// ╒════════════════════════════════════════════════════════╕
//    FUNCTION: RENDERING TO CANVAS
//      > Draws everything onto the canvas each frame.
// ╘════════════════════════════════════════════════════════╛

function render() {
    // Clear whatever was drawn last frame (otherwise it all stacks, and that is No Good)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- 1. Draw the background ---
    if (bgImage != null) // If there's an image uploaded
    {
        // Scale and center the image on the canvas
        var imgW = bgImage.naturalWidth * bgScale;
        var imgH = bgImage.naturalHeight * bgScale;
        var offX = (canvas.width - imgW) / 2;
        var offY = (canvas.height - imgH) / 2;
        ctx.drawImage(bgImage, offX, offY, imgW, imgH);
    } 
    else  // No image uploaded yet, just fill with a dark color (because dark mode is better, obviously)
    {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }


    // --- 2. Draw grid lines ---
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (var col = 0; col <= COLS; col++) 
    {
        ctx.beginPath();
        ctx.moveTo(col * cellSize, 0);
        ctx.lineTo(col * cellSize, canvas.height);
        ctx.stroke();
    }

    // Horizontal lines
    for (var row = 0; row <= ROWS; row++) 
    {
        ctx.beginPath();
        ctx.moveTo(0, row * cellSize);
        ctx.lineTo(canvas.width, row * cellSize);
        ctx.stroke();
    }


    // --- 3. Draw the green trail showing where the piece has moved ---
    // (Skip index 0 because that's the starting cell (don't want to highlight that for now))
    if (drag.visitedCells.length > 1) 
    {
        ctx.fillStyle = "rgba(0, 200, 80, 0.45)";
        for (var i = 1; i < drag.visitedCells.length; i++) 
        {
            var tx = drag.visitedCells[i].x;
            var ty = drag.visitedCells[i].y;
            // +1 and -2 so there's a tiny gap between the highlight and the grid lines
            ctx.fillRect(tx * cellSize + 1, ty * cellSize + 1, cellSize - 2, cellSize - 2);
        }
    }


    // --- 4. Draw the player tokens ---
    for (var i = 0; i < tokens.length; i++) 
    {
        var T = tokens[i];
        var center = cellCenter(T.gridX, T.gridY);
        var radius = cellSize * 0.38;

        if (T.type === 'image' && T.imgTag)
        {
            // --- Draw token with image ---
            ctx.save();
            ctx.beginPath();
            ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip(); // Clip the drawing area to a circle
            
            ctx.drawImage(T.imgTag, center.cx - radius, center.cy - radius, radius * 2, radius * 2);
            ctx.restore();
            
            // Draw a border/"frame"
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        else 
        {
            ctx.beginPath();
            ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = T.color; // Use the color stored in the token object
            ctx.fill();
            ctx.strokeStyle = T.color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
    }
}


// Random color generator until I get player token images
// Do you really have a functioning site without a random color generator? I think not
function generateRandomRgbColor() 
{
    const r = Math.floor(Math.random() * 256); // Random number between 0-255
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);

    return `rgb(${r}, ${g}, ${b})`;
}




// ╒═════════════════════════════════════════════════════╕
//    EVENT LISTENERS
//      > Listens for buttons, touch, webSocket, etc.
// ╘═════════════════════════════════════════════════════╛

// --- Pointer events (works for both mouse and touch) ---
// "preventDefault" gets rid of touch actions that browsers have (i.e. swipe to go back, etc.) which is VERY annoying for this project
canvas.addEventListener("pointerdown", function (e) 
{
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    onPointerDown(e.clientX, e.clientY);
}, { passive: false });  // passive: false lets preventDefault() actually work on touch

canvas.addEventListener("pointermove", function (e) 
{
    e.preventDefault();
    onPointerMove(e.clientX, e.clientY);
}, { passive: false });

canvas.addEventListener("pointerup", function (e) 
{
    e.preventDefault();
    onPointerUp();
}, { passive: false });

canvas.addEventListener("pointercancel", function () 
{
    drag.active = false;
    render();
});


// --- Apply button: update cell size ---
document.getElementById("applyBtn").addEventListener("click", function () 
{
    var input = document.getElementById("cellSizeInput");
    var newSize = parseInt(input.value);

    // Make sure it's a valid number within the allowed range (negatives would probably make the site explode, plus having too big of a number could be troublesome)
    if (isNaN(newSize) || newSize < 10 || newSize > 200) 
    {
        return;
    }

    cellSize = newSize;
    resizeCanvas();
    render();
});


// Pressing 'Enter' in the cell size field works the same as clicking 'Apply' button
// (I realized this was annoying when I automatically tried to press enter and nothing happened lol)
document.getElementById("cellSizeInput").addEventListener("keydown", function (e) 
{
    if (e.key == "Enter") 
    {
        document.getElementById("applyBtn").click();
    }
});

// --- Background image upload ---
document.getElementById("bgUpload").addEventListener("change", function () 
{
    var file = this.files[0];
    if (!file) 
    { 
        return; 
    }

    // create a temporary URL for the selected file so it can load
    var url = URL.createObjectURL(file);

    var img = new Image();
    img.onload = function () 
    {
        bgImage = img;

        // default scale: fit the image to the canvas height
        bgScale = canvas.height / img.naturalHeight;

        // update the slider to match and show it
        document.getElementById("bgScale").value = bgScale.toFixed(2);
        document.getElementById("scaleLabel").style.display = "inline-flex";

        render();
    };
    img.src = url;
});


// --- Background scale slider ---
document.getElementById("bgScale").addEventListener("input", function () 
{
    bgScale = parseFloat(this.value);
    render();
});


// --- Window resize ---
window.addEventListener("resize", function () 
{
    resizeCanvas();
    render();
});


// NEW: --- Add new player token ---
// UPDATE: Redone to use Croppie for player images
document.getElementById("addTokenBtn").addEventListener("click", function () {
    document.getElementById('tokenModal').style.display = 'block'; // Make the popup for options show up
});

// Color Palette Selection
document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', function() {
        spawnToken({ type: 'color', color: this.dataset.color });
        document.getElementById('tokenModal').style.display = 'none';
    });
});

// Handling Image Upload via Croppie
document.getElementById('tokenImageInput').addEventListener('change', function() {
    var reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('croppie-demo').style.display = 'block';
        document.getElementById('saveImageBtn').style.display = 'inline-block';
        
        if (croppieInstance) { croppieInstance.destroy(); }
        
        croppieInstance = new Croppie(document.getElementById('croppie-demo'), {
            viewport: { width: 100, height: 100, type: 'circle' },
            boundary: { width: 200, height: 200 },
            showZoomer: true
        });
        croppieInstance.bind({ url: e.target.result });
    }
    reader.readAsDataURL(this.files[0]);
});

document.getElementById('saveImageBtn').addEventListener('click', function() {
    croppieInstance.result({ type: 'base64', size: 'viewport', format: 'png', circle: true }).then(function(base64) {
        spawnToken({ type: 'image', imgData: base64 });
        document.getElementById('tokenModal').style.display = 'none';
    });
});

// NEW: --- Disable right-click menu (which happens when long-pressing on a touchscreen; it can mess with the piece movement) ---
// Source - https://stackoverflow.com/a/737043
// Posted by cletus, modified by community. See post 'Timeline' for change history
// Retrieved 2026-03-20, License - CC BY-SA 3.0
document.addEventListener('contextmenu', event => event.preventDefault());




// ╒═════════════════════════════════════════════╕
//    WEBSOCKET LISTENERS
//      > Specifically listens for server stuff
// ╘═════════════════════════════════════════════╛

// Listen for moves from others
socket.on('tokenUpdate', function (data) 
{
    if (tokens[data.index]) 
    {
        tokens[data.index].gridX = data.x;
        tokens[data.index].gridY = data.y;
        render();
    }
});

// Listen for new player tokens and display them on other clients
// UPDATED for player image tokens
socket.on('addRemoteToken', function (data) {
    if (data.type === 'image') {
        var img = new Image();
        img.onload = function() { render(); };
        img.src = data.imgData;
        data.imgTag = img;
    }
    tokens.push(data);
    render();
});




// ╒═════════════════════════════════════════════════════════════════════════════════╕
//    START
//      > Important to be on the bottom so every change made from functions loads
// ╘═════════════════════════════════════════════════════════════════════════════════╛
resizeCanvas();
render();