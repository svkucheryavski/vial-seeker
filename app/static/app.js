// constants
const MAX_VIALS_NUM = 10 // how many vials show in the search list (in addition to first found)

// get references to DOM elements
const uploadPane = document.querySelector('.image-upload-pane');
const searchPane = document.querySelector('.search-pane');
const messageArea = document.getElementById('messageField');
const imageInput = document.getElementById('imageInput');
const imageInputLabel = document.getElementById('imageInputLabel');
const vialCanvas = document.getElementById('vialCanvas');
const foundVialsList = document.getElementById('foundVialsList');
const resetButton = document.getElementById('resetButton');
const searchInput = document.getElementById('searchInput');

const vialCtx = vialCanvas.getContext('2d');

const state = {
   vialImage: new Image(),
   vialImageWidth: 0,
   vialImageHeight: 0,
   canvasScaleX: 1,
   canvasScaleY: 1,
   canvasScale: 1,
   searchString: '',
   selectedVials: [],
   vialList: []
};

/**********************/
/* Methods            */
/**********************/


// Resets everything to initial stage
function resetAll() {
   state.vialImageWidth = 0;
   state.vialImageHeight = 0;
   state.canvasScaleX = 1;
   state.canvasScaleY = 1;
   state.canvasScale = 1;
   state.searchString = '';
   state.selectedVials = [];
   state.vialList = [];
   state.vialImage = new Image();

   vialCanvas.style.display = 'none';
   searchPane.style.display = 'none';
   uploadPane.style.display = 'flex';
   foundVialsList.innerHTML = '';

   searchInput.value = '';
   imageInput.value = '';
   imageInput.files[0] = null;
   imageInputLabel.style.display = 'block';
}


// Receives the response data, extract vial image and list of the vials and draw the image
function processResponse(data) {

   // hide the upload panel and reveal the search panel
   uploadPane.style.display = 'none';
   searchPane.style.display = 'grid';

   const item = data[0];
   state.vialList = item.vials;
   state.vialImageWidth = item.imgWidth;
   state.vialImageHeight = item.imgHeight;
   state.vialImage.src = 'data:image/png;base64,' + item.img;

   // Ensure image is fully loaded before resizing and drawing
   state.vialImage.onload = () => {
      vialCanvas.style.display = 'block';
      resizeCanvas();
   };
}


// Adjusts scale factors based on current canvas size and redraw the canvas
function resizeCanvas() {
   vialCanvas.width = (window.innerWidth - 10) / 2;
   vialCanvas.height = vialCanvas.width / state.vialImageWidth * state.vialImageHeight;
   state.canvasScaleX = vialCanvas.width / state.vialImageWidth;
   state.canvasScaleY = vialCanvas.height / state.vialImageHeight;
   state.canvasScale = Math.min(state.canvasScaleX, state.canvasScaleY);
   drawImage();
   drawVials();
}


// Draws vial image on the canvas
function drawImage() {
   vialCtx.save();
   vialCtx.scale(state.canvasScale,state. canvasScale);
   vialCtx.clearRect(0, 0, state.vialImageWidth, state.vialImageHeight);
   vialCtx.drawImage(state.vialImage, 0, 0, state.vialImageWidth, state.vialImageHeight);
   vialCtx.restore();
}


// Adds semitransparent white rectangle on top of the vial image */
function drawBackstage() {
   vialCtx.save();
   vialCtx.scale(state.canvasScale, state.canvasScale);
   vialCtx.globalAlpha = 0.5;
   vialCtx.fillStyle = 'white';
   vialCtx.fillRect(0, 0, state.vialImageWidth, state.vialImageHeight);
   vialCtx.globalAlpha = 1.0;
   vialCtx.fill();
   vialCtx.restore();
}


// Draws a single vial on the canvas */
function drawVial(cx, cy, cr, color, thickness) {
   vialCtx.beginPath();
   vialCtx.strokeStyle = color;
   vialCtx.lineWidth = thickness;
   vialCtx.arc(cx, cy, cr, 0, Math.PI * 2);
   vialCtx.stroke();
}

// Draws first five selected vials
function drawVials() {
   if (state.selectedVials.length < 1) return;

   drawBackstage();
   vialCtx.save();
   vialCtx.scale(state.canvasScale, state.canvasScale);

   // first vial in the list must be shown red and thick
   let vial = state.selectedVials[0];
   drawVial(vial[1], vial[2], vial[3], '#ff3d00', 15);

   // the other vials just black
   for (let i = 1; i < Math.min(state.selectedVials.length, MAX_VIALS_NUM); i++) {
      vial = state.selectedVials[i];
      drawVial(vial[1], vial[2], vial[3], 'black', 10);
   }

   vialCtx.restore()
}

// Crops the selected vial on the main vial image and return it as IMG element and code
function cropSelectedVial(cx, cy, r) {
   const startX = cx - r;
   const startY = cy - r;
   const width = 2 * r;
   const height = 2 * r;

   // Create a canvas element
   const canvas = document.createElement('canvas');
   const ctx = canvas.getContext('2d');

   // Set the canvas size to the full image size
   canvas.width = state.vialImage.width;
   canvas.height = state.vialImage.height;

   // Draw the image onto the canvas
   ctx.drawImage(state.vialImage, 0, 0, state.vialImage.width, state.vialImage.height);

   // Get the image data for the specified region
   const imageData = ctx.getImageData(startX, startY, width, height);

   // Create a new canvas for the cropped image
   const croppedCanvas = document.createElement('canvas');
   const croppedCtx = croppedCanvas.getContext('2d');

   // Set the new canvas size to the crop size
   croppedCanvas.width = width;
   croppedCanvas.height = height;
   croppedCtx.putImageData(imageData, 0, 0);

   // Create a new image from the cropped canvas
   const croppedImage = new Image();
   croppedImage.src = croppedCanvas.toDataURL();


   // Create a temporary container
   const tempContainer = document.createElement('div');

   // Append the image to the temporary container
   tempContainer.appendChild(croppedImage);

   return {
      image: croppedImage,
      html: tempContainer.innerHTML
   };
}

// Communication
function showError(text) {
   messageArea.innerHTML = text
   messageArea.className = 'error';
   messageArea.style.display = 'flex';
}

function showMessage(text) {
   messageArea.innerHTML = text
   messageArea.className = 'message';
   messageArea.style.display = 'flex';
}

function hideMessage() {
   messageArea.className = '';
   messageArea.innerHTML = '';
   messageArea.style.display = 'none';
}

// Debounce function to limit the rate of search input handling
function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    };
}

// Listeners
imageInput.addEventListener('change', async () => {
   const file = imageInput.files[0];
   if (!file) {
      showError('Please select an image file.');
      return;
   }

   imageInputLabel.style.display = 'none';
   const formData = new FormData();
   formData.append('image', file);

   try {
      hideMessage()
      imageInputLabel.style.display = 'none';
      showMessage('<span class="loader"></span><span>Processing image, please wait...</span>');

      const response = await fetch('/process_image', {
         method: 'POST',
         body: formData
      });

      if (!response.ok) {
         showError('Server returned an error, check image file and try again.');
         imageInputLabel.style.display = 'block';
      } else if (response.status === 500){
         showError('Network response was not ok, try again.');
         imageInputLabel.style.display = 'block';
      } else {
         const data = await response.json();
         processResponse(data);
         hideMessage()
      }
   } catch (error) {
      resetAll();
      showError('There was a problem with the fetch operation: ' + error);
      imageInputLabel.style.display = 'block';
   }
});

searchInput.addEventListener('keyup', debounce(() => {
   const searchString = searchInput.value.trim();
   if (searchString === '') {
      state.selectedVials = [];
   } else {
      state.selectedVials = state.vialList.filter(v => v[0].includes(searchInput.value))
   }

   let listElements = '';
   for (let i = 0; i < Math.min(state.selectedVials.length, MAX_VIALS_NUM); i++) {
      const vial = state.selectedVials[i];
      if (i == 0) {
         const img = cropSelectedVial(vial[1], vial[2], vial[3]);
         listElements += `<li>${img.html}<br> ${vial[0]}</li>`;
      } else {
         listElements += `<li>${vial[0]}</li>`;
      }
   }

   foundVialsList.innerHTML = listElements
   resizeCanvas();
}, 50));

resetButton.addEventListener('click', () => {
   resetAll();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
