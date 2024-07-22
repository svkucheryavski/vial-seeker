from flask import Flask, request, jsonify, render_template
import app.methods as m
from PIL import Image
import numpy as np
import io
import base64

app = Flask(__name__)

def numpy_to_base64(arr):
    """Convert a NumPy array to a base64 encoded string."""
    pil_img = Image.fromarray(arr)
    buff = io.BytesIO()
    pil_img.save(buff, format="PNG")
    return base64.b64encode(buff.getvalue()).decode("utf-8")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/process_image', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    img = Image.open(file.stream)
    img = m.prepare_image(np.array(img))
    img = m.preprocess_image(img)

    imgHeight, imgWidth  = img.shape
    vials = m.detect_vials(img)[0]

    res = []
    for v in vials:
        r = m.get_number_on_vial(img, v)
        res.append(r[0:4])

    # Convert NumPy arrays to base64 encoded strings
    img_base64 = numpy_to_base64(img)

    # Prepare the response
    response = [{
        'text': 'Processed image part 1',
        'img': img_base64,
        'vials': res,
        'imgWidth': imgWidth,
        'imgHeight': imgHeight
    }]

    return jsonify(response)


if __name__ == '__main__':
    app.run(debug=True)
