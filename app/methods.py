import cv2
import numpy as np
import pytesseract
import matplotlib.pyplot as plt

from PIL import Image
from itertools import combinations
from numpy.typing import NDArray

#pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

# predefined image size - all images will be rescaled to after preprocessing
VIAL_AREA_SIZE = (3878, 2550)

def prepare_image(img):
    """ converts image to grayscale mode and rotate if necessary """

    img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # rotate image if necessary so width > height
    nrows, ncols = img.shape
    if nrows > ncols:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)

    return img


def get_image(image_path):
    """ loads image from file and applies preprocessing """

    img = cv2.imread(image_path)
    return prepare_image(img)


def order_points(points):
    """ orders points of quadrilateral from top left to bottom left """

    # ensure points is a numpy array
    points = np.array(points, dtype="float32")

    # find the center of the quadrilateral
    center = points.mean(axis=0)

    # calculate the angles
    angles = np.arctan2(points[:,1] - center[1], points[:,0] - center[0])

    # sort points based on their angles
    sorted_indices = np.argsort(angles)
    sorted_points = points[sorted_indices]

    # find the top-left point
    # we'll use the point that's furthest from the center in the opposite direction
    vectors = sorted_points - center
    distances = np.linalg.norm(vectors, axis=1)
    opposite_vectors = -vectors
    dot_products = np.sum(vectors * opposite_vectors, axis=1)
    top_left_idx = np.argmax(dot_products * distances)

    # reorder points starting from top-left
    reordered_points = np.roll(sorted_points, -top_left_idx, axis=0)

    return reordered_points


def get_vial_area_polygon(img, kernel_size = 15, scale_factor = 1.05):
    """ returns points of a polygon around vial container """

    # apply median blur to supress noise
    blurred = cv2.medianBlur(img, kernel_size)

    # apply threshold to reveal area with vials
    _, bw = cv2.threshold(blurred, 0, 255, cv2.THRESH_OTSU)

    # use erosion and dilation to keep only large conglomerates of white pixels
    kernel = np.ones((kernel_size, kernel_size))
    bw = 255 - bw
    bw = cv2.erode(bw, kernel)
    bw = cv2.dilate(bw, kernel)

    # find contours of all objects
    contours, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # identify the contour with the biggest area
    main_contour = max(contours, key=cv2.contourArea)

    # find the convex hull of the main contour
    hull = cv2.convexHull(main_contour)

    # approximate the hull to a four-sided polygon (trapezium)
    epsilon = 0.02 * cv2.arcLength(hull, True)
    approx = cv2.approxPolyDP(hull, epsilon, True)

    # ensure we have exactly 4 points
    if len(approx) != 4:
        # If not, find the 4 points that form the largest quadrilateral
        max_area = 0
        best_quad = None
        for quad in combinations(hull, 4):
            area = cv2.contourArea(np.array(quad).astype(np.float32))
            if area > max_area:
                max_area = area
                best_quad = np.array(quad)
        approx = best_quad

    # reorder the polygon points
    points = approx.reshape(4, 2)
    ordered_points = order_points(points)

    # scale the points outward from the centroid by 10%
    centroid = np.mean(ordered_points, axis=0)
    ordered_points = centroid + scale_factor * (ordered_points - centroid)

    return (ordered_points, contours, bw, main_contour)


def correct_image(img, vial_area_points):
    """ apply transformation to make vial area polygon to be rectangular """

    (top_left, top_right, bottom_right, bottom_left) = vial_area_points

    # compute width and height of a future rectangle
    width_a = np.linalg.norm(bottom_right - bottom_left)
    width_b = np.linalg.norm(top_right - top_left)
    max_width = max(int(width_a), int(width_b))

    height_a = np.linalg.norm(top_right - bottom_right)
    height_b = np.linalg.norm(top_left - bottom_left)
    max_height = max(int(height_a), int(height_b))

    # define coordinates of the future rectangle
    destination_rect = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1]], dtype="float32")

    # calculate the perspective transform matrix from current polygon to desired rectangle
    transformation_matrix = cv2.getPerspectiveTransform(vial_area_points, destination_rect)

    # apply the perspective transformation
    img = cv2.warpPerspective(img, transformation_matrix, (max_width, max_height))

    # rotate if needed
    nrows, ncols = img.shape
    if nrows > ncols:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)

    # scale to fixed predefined size and return
    return cv2.resize(img, VIAL_AREA_SIZE, interpolation = cv2.INTER_LINEAR)


def preprocess_image(img, kernel_size = 15, scale_factor = 1.1):
    """ apply croping and geometric correction to improve the image """

    # get points of a polygon around vial container
    (vial_area_points, contours, bw, mc) = get_vial_area_polygon(img, kernel_size=kernel_size, scale_factor=scale_factor)

    # uncomment for debug
    # return (correct_image(img, vial_area_points=vial_area_points), vial_area_points, contours, bw, mc)
    return correct_image(img, vial_area_points=vial_area_points)


def detect_vials(img, kernel_size = 15):
    """ detects all circles on the image """

    img = cv2.medianBlur(img, kernel_size)

    nrows, ncols = img.shape[:2]
    maxRadius = int(nrows / 16 if nrows < ncols else ncols / 16)
    minRadius = int(maxRadius * 0.75)
    circles = cv2.HoughCircles(
        img,
        cv2.HOUGH_GRADIENT,
        1,
        minDist=2*minRadius,
        param1=50,
        param2=30,
        minRadius=minRadius,
        maxRadius=maxRadius
    )

    return np.uint16(np.around(circles))


def apply_circular_mask(img, radius1, radius2):
    """
    Apply a circular mask to a square image array.
    Pixels outside the circle will be set to 0.

    :param image_array: 2D or 3D numpy array representing the image
    :param radius: radius of the circle
    :return: masked image array
    """
    # Get image dimensions
    height, width = img.shape[:2]

    # Create a coordinate grid
    y, x = np.ogrid[:height, :width]

    # Calculate the center of the image
    center_y, center_x = height // 2, width // 2

    # Calculate squared distance from the center
    dist_from_center = (x - center_x)**2 + (y - center_y)**2

    # Create circular mask
    mask = (dist_from_center <= radius1**2) & (dist_from_center >= radius2**2)

    # Expand dimensions of the mask if the image has a channel dimension
    if img.ndim == 3:
        mask = np.expand_dims(mask, axis=2)

    # Apply the mask
    masked_image = np.where(mask, img, 0)

    return masked_image


def stretch_contrast(img, percent = 2.0):
    """ applies contrast stretching transformation """
    mn = np.percentile(img, percent)
    mx = np.percentile(img, 100 - percent)
    img = (img - mn) / (mx - mn)
    img[img > 1] = 1
    img[img < 0] = 0
    return np.uint8(img * 255)


def get_qrrect_position(img):
    """ finds pixels belonging to QR code block and returns a center of the pixels """

    # contrast stretching
    img = stretch_contrast(img)

    img = cv2.medianBlur(img, 5)
    _, img_bw = cv2.threshold(img, 150, 255, cv2.THRESH_BINARY)

    img_bw = cv2.dilate(img_bw, np.ones((9, 9)))
    img_bw = cv2.erode(img_bw, np.ones((9, 9)))
    img_bw = cv2.erode(img_bw, np.ones((9, 9)))
    img_bw = cv2.dilate(img_bw, np.ones((9, 9)))

    contours, _ = cv2.findContours(img_bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(contours) < 1:
        raise Exception("no QR block found.")

    main_contour = max(contours, key=cv2.contourArea)
    hull = cv2.convexHull(main_contour)
    return (hull.mean(axis = 0)[0], img_bw)


def norm(v):
    return v / np.sqrt(sum(v**2))


def rotate_vial(img, qr):

    # get position of center and radius of the vial
    nrows, ncols = img.shape
    rad = int(nrows/2)
    cr = rad
    cc = rad

    angle = np.arctan2(qr[0] - rad, qr[1] - rad)
    angle = angle / 3.1415926 * 180

    rotation_matrix = cv2.getRotationMatrix2D((cc + 0.0, cr + 0.0), -angle, 1.0)
    return (cv2.warpAffine(img, rotation_matrix, (2 * rad, 2 * rad)), angle)


def unwrap_vial(img):

    # get position of center and radius of the vial
    nrows, ncols = img.shape
    rad = int(nrows/2)

    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    img = cv2.warpPolar(img, (-1, -1), (rad + 0.0, rad + 0.0), rad, cv2.WARP_FILL_OUTLIERS)
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    h, w = img.shape
    return img[2:int(h/2), int(w/8):int(w - w/8), ]


def get_number_on_vial(img, vial):
    """ returns number detected on a vial (as well as other results) """

    cx, cy, r = vial
    v_img = img[cy-r:cy+r, cx-r:cx+r]
    v_img = apply_circular_mask(v_img, r - 5 , r / 3)

    v_img = stretch_contrast(v_img)

    try:
        qr, v_img_bw = get_qrrect_position(v_img)
    except Exception as e:
        return None

    v_img_rot, angle = rotate_vial(v_img, qr)
    v_img_un = unwrap_vial(v_img_rot)
    v_img_un = cv2.medianBlur(v_img_un, 5)
    #v_img_un = cv2.threshold(v_img_un, 100, 255, cv2.THRESH_OTSU + cv2.THRESH_BINARY)[1]
    text = pytesseract.image_to_string(Image.fromarray(v_img_un), config='--psm 7 outputbase digits')

    return (text, int(cx), int(cy), int(r), v_img, v_img_rot, v_img_un, v_img_bw, qr, angle)
