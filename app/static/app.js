// constants
MAX_VIALS_NUM = 10 // how many vials show in the search list (in addition to first found)

// get references to DOM elements
const uploadPane = document.querySelector('.image-upload-pane');
const searchPane = document.querySelector('.search-pane');
const messageArea = document.getElementById('messageField');
const imageInput = document.getElementById('imageInput');
const imageInputLabel = document.getElementById('imageInputLabel');
const vialCanvas = document.getElementById('vialCanvas');
const foundVialsList = document.getElementById('foundVialsList');
const resetButton = document.getElementById('resetButton');
const vialCtx = vialCanvas.getContext('2d');
const vialImage = new Image();

// global variables related to image and canvas size
let vialImageWidth = 0;
let vialImageHeight = 0;
let canvasScaleX = 1;
let canvasScaleY = 1;
let canvasScale = 1;

// global variables for search
let metaData = undefined;
let searchString = "";
let selectedVials = [];
let vialList = [];


/**********************/
/* Methods            */
/**********************/

// Resets everything to initial stage
function resetAll() {
   vialImageWidth = 0;
   vialImageHeight = 0;
   canvasScaleX = 1;
   canvasScaleY = 1;
   canvasScale = 1;

   searchString = '';
   selectedVials = [];
   vialList = [];
   searchInput.value = '';

   vialImage.src = '';
   vialCanvas.style.display = 'none';
   searchPane.style.display = 'none';
   uploadPane.style.display = 'flex';
   foundVialsList.innerHTML = '';

   imageInput.value = '';
   imageInput.files[0] = null;
   imageInputLabel.style.display = 'block';
}


// Receives the response data, extract vial image and list of the vials and draw the image
function processResponse(data) {

   // hide the upload panel and reveal the search panel
   uploadPane.style.display = 'none';
   searchPane.style.display = 'grid';

   item = data[0];
   vialList = item.vials;
   vialImageWidth = item.imgWidth;
   vialImageHeight = item.imgHeight;
   vialImage.src = 'data:image/png;base64,' + item.img;
   vialCanvas.style.display = 'block';
   resizeCanvas();
}


// Adjusts scale factors based on current canvas size and redraw the canvas
function resizeCanvas() {
   vialCanvas.width = (window.innerWidth - 10) / 2;
   vialCanvas.height = vialCanvas.width / vialImageWidth * vialImageHeight;
   canvasScaleX = vialCanvas.width / vialImageWidth;
   canvasScaleY = vialCanvas.height / vialImageHeight;
   canvasScale = Math.min(canvasScaleX, canvasScaleY);
   drawImage();
   drawVials();
}


// Draws vial image on the canvas
function drawImage() {
   vialCtx.save();
   vialCtx.scale(canvasScale, canvasScale);
   vialCtx.clearRect(0, 0, vialImageWidth, vialImageHeight);
   vialCtx.drawImage(vialImage, 0, 0, vialImageWidth, vialImageHeight);
   vialCtx.restore();
}


// Adds semitransparent white rectangle on top of the vial image */
function drawBackstage() {
   vialCtx.save();
   vialCtx.scale(canvasScale, canvasScale);
   vialCtx.globalAlpha = 0.5;
   vialCtx.fillStyle = 'white';
   vialCtx.fillRect(0, 0, vialImageWidth, vialImageHeight);
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
   if (selectedVials.length < 1) return;

   drawBackstage();
   vialCtx.save();
   vialCtx.scale(canvasScale, canvasScale);

   // first vial in the list must be shown red and thick
   vial = selectedVials[0];
   drawVial(vial[1], vial[2], vial[3], '#ff3d00', 15);

   // the other vials just black
   for (let i = 1; i < Math.min(selectedVials.length, MAX_VIALS_NUM); i++) {
      vial = selectedVials[i];
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
   canvas.width = vialImage.width;
   canvas.height = vialImage.height;

   // Draw the image onto the canvas
   ctx.drawImage(vialImage, 0, 0, vialImage.width, vialImage.height);

   // Get the image data for the specified region
   const imageData = ctx.getImageData(startX, startY, width, height);

   // Create a new canvas for the cropped image
   const croppedCanvas = document.createElement('canvas');
   const croppedCtx = croppedCanvas.getContext('2d');

   // Set the new canvas size to the crop size
   croppedCanvas.width = width;
   croppedCanvas.height = height;

   // Put the extracted image data onto the new canvas
   croppedCtx.putImageData(imageData, 0, 0);

   // Create a new image from the cropped canvas
   const croppedImage = new Image();
   croppedImage.src = croppedCanvas.toDataURL();


   // Create a temporary container
   const tempContainer = document.createElement('div');

   // Append the image to the temporary container
   tempContainer.appendChild(croppedImage);

   // Get the HTML as a string
   const htmlString = tempContainer.innerHTML;

   return {
      image: croppedImage,
      html: htmlString
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
      showError('There was a problem with the fetch operation: ' + error);
      imageInputLabel.style.display = 'block';
   } finally {
   }
});

searchInput.addEventListener('keyup', () => {
   const searchString = searchInput.value.trim();
   if (searchString === '') {
      selectedVials = [];
   } else {
      selectedVials = vialList.filter(v => v[0].includes(searchInput.value))
   }

   let listElements = '';
   for (let i = 0; i < Math.min(selectedVials.length, MAX_VIALS_NUM); i++) {
      const vial = selectedVials[i];
      if (i == 0) {
         const img = cropSelectedVial(vial[1], vial[2], vial[3]);
         listElements += `<li>${img.html}<br> ${vial[0]}</li>`;
      } else {
         listElements += `<li>${vial[0]}</li>`;
      }
   }

   foundVialsList.innerHTML = listElements
   resizeCanvas();
});

resetButton.addEventListener('click', () => {
   resetAll();
});

resizeCanvas();
