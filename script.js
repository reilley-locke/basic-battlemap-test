// ╒═════════════╕
//    VARIABLES
// ╘═════════════╛

// WEBSOCKET
// --------------------
var socket = io();

// SETTINGS
// --------------------
var cellSize = 60;          // how many pixels wide/tall each grid square is
var MAX_MOVES = 6;      // how many squares a piece is allowed to move per turn

// these get calculated in resizeCanvas() based on screen size
var COLS = 0;
var ROWS = 0;


// BACKGROUND IMAGE
// ---------------------
var bgImage = null;     // will hold the Image object once the user uploads one
var bgScale = 1.0;      // zoom level for the background image


// PLAYER PIECES
// ---------------------
// gridX and gridY are the column and row the piece is sitting on (starts at 2,2 to make aiming the piece easier for my sanity)
var tokens = [
    { gridX: 2, gridY: 2, color: "crimson" } // Start with one default token, at 2,2, colored red
];


// DRAG STATE
// ---------------------
// tracks everything about the current drag gesture
var drag = {
    active: false,      // is the player currently dragging? (boolean)
    targetIndex: -1,    // ADDED: tracks which token in the list we are dragging
    startGX: 0,         // column (x-coord) where the drag started
    startGY: 0,         // row (y-coord) where the drag started
    visitedCells: []    // list of every cell the piece has passed through this drag
    // each item looks like this: { x: col, y: row }
};


// CANVAS SETUP
// ---------------------
var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");



// ╒════════════════════════════════════════════════════════════════╕
//    FUNCTION: RESIZE CANVAS
//      > Makes the canvas fill the space below the controls bar.
//      > Called on page load and whenever the window is resized.
// ╘════════════════════════════════════════════════════════════════╛

function resizeCanvas() {
    // figure out how tall the controls bar is so we can avoid it
    var controlsBar = document.getElementById("controls");
    var ctrlH = controlsBar.offsetHeight;

    var availableWidth = window.innerWidth;
    var availableHeight = window.innerHeight - ctrlH;

    // only use whole cells so we never end up with a partial square at the edge
    COLS = Math.floor(availableWidth / cellSize);
    ROWS = Math.floor(availableHeight / cellSize);

    // set the canvas pixel size to exactly fit those cells
    canvas.width = COLS * cellSize;
    canvas.height = ROWS * cellSize;

    // move the canvas down below the controls bar
    canvas.style.top = ctrlH + "px";
    canvas.style.left = "0px";

    // if the grid shrank, make sure the player pieces didn't end up outside it
    for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].gridX > COLS - 1) { tokens[i].gridX = COLS - 1; }
        if (tokens[i].gridY > ROWS - 1) { tokens[i].gridY = ROWS - 1; }
    }
}



// ╒════════════════════════════════════╕
//        HELPERS FOR COORDINATES
// ╘════════════════════════════════════╛

// Converts a screen position (like from a mouse/touch event) into grid column + row.
// Returns null if the position is outside the canvas.
function pageToGrid(pageX, pageY) {
    var rect = canvas.getBoundingClientRect(); // Bounding coordinates

    // Position relative to the canvas top-left corner
    // .left and .top are the same as style.left and style.top etc
    var x = pageX - rect.left;
    var y = pageY - rect.top;

    // Exit function if outside the canvas area
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        return null;
    }

    return { // Return coordinates {x, y}
        gx: Math.floor(x / cellSize),
        gy: Math.floor(y / cellSize)
    };
}

// Returns the pixel coordinates of the center of a given grid cell.
// Useful for drawing things in the middle of a square.
function cellCenter(gx, gy) {
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
// Only starts a drag if they clicked directly on the player piece.
function onPointerDown(pageX, pageY) {
    var cell = pageToGrid(pageX, pageY);
    if (cell == null) { return; } // If cell does not exit, blow up

    for (var i = 0; i < tokens.length; i++) { // ADDED: Loop for detecting which token is being touched
        // check if the click landed on the player's current cell
        if (cell.gx == tokens[i].gridX && cell.gy == tokens[i].gridY) {
            drag.active = true;
            drag.targetIndex = i; // Stores the index of the grabbed token for later
            drag.startGX = tokens[i].gridX;
            drag.startGY = tokens[i].gridY;

            // the starting cell goes in the list but doesn't count as a move
            drag.visitedCells = [{ x: tokens[i].gridX, y: tokens[i].gridY }];

            updateMoveInfo();
            render();
            return; //exits the loop once a match is found (don't keep going)
        }
    }
    render();
}

// Called while the player moves their finger/mouse during a drag.
// Moves the piece (player icon) to the new cell and tracks how many squares have been used.
function onPointerMove(pageX, pageY) {
    if (!drag.active) { return; } // If drag has stopped, exit function

    var cell = pageToGrid(pageX, pageY);
    if (cell == null) { return; } // If cell trying to travel to does not exist, exit function

    var gx = cell.gx;
    var gy = cell.gy;

    // Use the index saved from onPointerDown
    var currentToken = tokens[drag.targetIndex];

    // If already on this cell, nothing to do
    if (gx == currentToken.gridX && gy == currentToken.gridY) { return; }

    // check if the player is backtracking over a cell they already visited
    // if so, we "undo" moves back to that point instead of adding new ones
    var foundAt = -1;
    for (var i = 0; i < drag.visitedCells.length; i++) {
        if (drag.visitedCells[i].x == gx && drag.visitedCells[i].y == gy) {
            foundAt = i;
            break;
        }
    }

    if (foundAt != -1) {
        // trim the list back to the cell they returned to
        drag.visitedCells = drag.visitedCells.slice(0, foundAt + 1);
        currentToken.gridX = gx;
        currentToken.gridY = gy;
        updateMoveInfo();
        render();
        return;
    }

    // it's a brand new cell -- check if there's any movement budget left
    // (visitedCells[0] is the start, so moves used = length - 1)
    var movesUsed = drag.visitedCells.length - 1;
    if (movesUsed >= MAX_MOVES) {
        return; // out of moves, don't allow this step
    }

    // movement is allowed, add the cell and update the piece position
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

// Called when the player lifts their finger/mouse.
// Ends the drag and keeps the trail visible.
function onPointerUp() {
    if (!drag.active) { return; }
    drag.active = false;
    render();
}


// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────

// Updates the "Movement: X / 6 squares" text in the controls bar
function updateMoveInfo() {
    var movesUsed = 0;
    if (drag.active) {
        movesUsed = drag.visitedCells.length - 1;
    }
    document.getElementById("movementInfo").textContent = "Movement: " + movesUsed + " / " + MAX_MOVES + " squares";
}


// ─────────────────────────────────────────────
// RENDER
// Draws everything onto the canvas each frame.
// ─────────────────────────────────────────────

function render() {
    // Clear whatever was drawn last frame (otherwise it all stacks)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- 1. Draw the background ---
    if (bgImage != null) {
        // scale and center the image on the canvas
        var imgW = bgImage.naturalWidth * bgScale;
        var imgH = bgImage.naturalHeight * bgScale;
        var offX = (canvas.width - imgW) / 2;
        var offY = (canvas.height - imgH) / 2;
        ctx.drawImage(bgImage, offX, offY, imgW, imgH);
    } else {
        // no image uploaded yet, just fill with a dark color
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // --- 2. Draw grid lines ---
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;

    // vertical lines
    for (var col = 0; col <= COLS; col++) {
        ctx.beginPath();
        ctx.moveTo(col * cellSize, 0);
        ctx.lineTo(col * cellSize, canvas.height);
        ctx.stroke();
    }

    // horizontal lines
    for (var row = 0; row <= ROWS; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * cellSize);
        ctx.lineTo(canvas.width, row * cellSize);
        ctx.stroke();
    }

    // --- 3. Draw the green trail showing where the piece has moved ---
    // skip index 0 because that's the starting cell and we don't want to highlight it
    if (drag.visitedCells.length > 1) {
        ctx.fillStyle = "rgba(0, 200, 80, 0.45)";
        for (var i = 1; i < drag.visitedCells.length; i++) {
            var tx = drag.visitedCells[i].x;
            var ty = drag.visitedCells[i].y;
            // +1 and -2 so there's a tiny gap between the highlight and the grid lines
            ctx.fillRect(tx * cellSize + 1, ty * cellSize + 1, cellSize - 2, cellSize - 2);
        }
    }

    // --- 4. Draw the player tokens ---
    for (var i = 0; i < tokens.length; i++) {
        var T = tokens[i];
        var center = cellCenter(T.gridX, T.gridY);
        var radius = cellSize * 0.38;

        ctx.beginPath();
        ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = T.color; // Use the color stored in the token object
        ctx.fill();
        ctx.strokeStyle = T.color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}



function generateRandomRgbColor() {
    const r = Math.floor(Math.random() * 256); // Random number between 0-255
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);

    return `rgb(${r}, ${g}, ${b})`;
}

// Example Usage:
console.log(generateRandomRgbColor());
// Example output: rgb(193, 253, 111)




// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────

// --- Pointer events (works for both mouse and touch) ---

canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    onPointerDown(e.clientX, e.clientY);
}, { passive: false });  // passive: false lets preventDefault() actually work on touch

canvas.addEventListener("pointermove", function (e) {
    e.preventDefault();
    onPointerMove(e.clientX, e.clientY);
}, { passive: false });

canvas.addEventListener("pointerup", function (e) {
    e.preventDefault();
    onPointerUp();
}, { passive: false });

canvas.addEventListener("pointercancel", function () {
    drag.active = false;
    render();
});

// --- Apply button: update cell size ---

document.getElementById("applyBtn").addEventListener("click", function () {
    var input = document.getElementById("cellSizeInput");
    var newSize = parseInt(input.value);

    // make sure it's a valid number within the allowed range
    if (isNaN(newSize) || newSize < 10 || newSize > 200) {
        return;
    }

    cellSize = newSize;
    resizeCanvas();
    render();
});

// pressing Enter in the cell size field works the same as clicking Apply
document.getElementById("cellSizeInput").addEventListener("keydown", function (e) {
    if (e.key == "Enter") {
        document.getElementById("applyBtn").click();
    }
});

// --- Background image upload ---

document.getElementById("bgUpload").addEventListener("change", function () {
    var file = this.files[0];
    if (!file) { return; }

    // create a temporary URL for the selected file so we can load it as an image
    var url = URL.createObjectURL(file);

    var img = new Image();
    img.onload = function () {
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

document.getElementById("bgScale").addEventListener("input", function () {
    bgScale = parseFloat(this.value);
    render();
});

// --- Window resize ---

window.addEventListener("resize", function () {
    resizeCanvas();
    render();
});

// NEW: --- Add token ---
document.getElementById("addTokenBtn").addEventListener("click", function () {
    var newToken = {
        gridX: 1,
        gridY: 1,
        color: generateRandomRgbColor()
    };
    tokens.push(newToken);
    
    // TELL THE SERVER
    socket.emit('newToken', newToken); 
    
    render(); 
});

// Add this listener at the bottom with your other socket.on events
socket.on('addRemoteToken', function (data) {
    tokens.push(data);
    render();
});

io.on('connection', (socket) => {
    socket.on('tokenMove', (data) => {
        socket.broadcast.emit('tokenUpdate', data);
    });

    // NEW: Listen for new tokens and tell everyone else
    socket.on('newToken', (data) => {
        socket.broadcast.emit('addRemoteToken', data);
    });
});


// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

resizeCanvas();
render();