"""
Classification API Blueprint — /api/classification
"""
from flask import Blueprint, request, jsonify
from app.utils.auth import login_required, admin_required
from app.services.classification_service import LandUseClassifier

classification_bp = Blueprint("classification", __name__)
_classifier = LandUseClassifier()


@classification_bp.route("/predict", methods=["POST"])
@login_required
def predict():
    """Predict land use for a set of features."""
    data = request.get_json(silent=True) or {}
    features = data.get("features")
    if not features:
        return jsonify({"error": "features array required"}), 422

    results = _classifier.predict_batch(features)
    return jsonify({
        "predictions": results,
        "model_info": _classifier.model_info(),
        "disclaimer": (
            "These predictions are based on a model trained on simulated data. "
            "Results are indicative only and require field verification."
        )
    })


@classification_bp.route("/train", methods=["POST"])
@admin_required
def train():
    """Re-train the classifier on current simulated dataset."""
    metrics = _classifier.train()
    return jsonify({"message": "Model retrained.", "metrics": metrics})


@classification_bp.route("/info", methods=["GET"])
@login_required
def info():
    return jsonify(_classifier.model_info())
