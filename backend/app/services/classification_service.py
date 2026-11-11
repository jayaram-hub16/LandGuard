"""
Land Use Classification Service
scikit-learn Random Forest classifier trained on simulated GIS features.

DISCLAIMER: This model is trained on SIMULATED DATA ONLY.
Results are indicative and require field verification. Do not use for legal decisions.
"""
import json
import os
import warnings
from typing import Optional
warnings.filterwarnings("ignore")

LABEL_MAP = {
    0: "Residential",
    1: "Commercial",
    2: "Agriculture",
    3: "Road",
    4: "Water Body",
    5: "Forest",
    6: "Industrial",
    7: "Other",
}

REVERSE_MAP = {v: k for k, v in LABEL_MAP.items()}


class LandUseClassifier:
    """
    OOP wrapper for scikit-learn Random Forest land-use classifier.
    Trained on simulated feature vectors.
    """

    def __init__(self):
        self._model = None
        self._trained = False
        self._accuracy = None
        self._try_load_or_train()

    def _generate_training_data(self):
        """Generate synthetic training data for demonstration."""
        import numpy as np
        rng = np.random.default_rng(42)
        n = 500
        X, y = [], []

        # Residential: medium area, low NDVI, moderate density
        for _ in range(n // 8):
            X.append([
                rng.uniform(200, 1000),    # area_sqm
                rng.uniform(0.1, 0.3),     # ndvi (low-medium)
                rng.uniform(0.5, 0.9),     # building_density
                rng.uniform(0.2, 0.6),     # impervious_surface
                rng.uniform(0.0, 0.1),     # water_index
                rng.uniform(10, 40),       # road_distance_m
            ])
            y.append(0)

        # Commercial: large area, low NDVI, high density
        for _ in range(n // 8):
            X.append([
                rng.uniform(500, 5000),
                rng.uniform(0.05, 0.25),
                rng.uniform(0.7, 1.0),
                rng.uniform(0.6, 1.0),
                rng.uniform(0.0, 0.05),
                rng.uniform(5, 30),
            ])
            y.append(1)

        # Agriculture: large area, high NDVI, low density
        for _ in range(n // 8):
            X.append([
                rng.uniform(2000, 50000),
                rng.uniform(0.5, 0.9),
                rng.uniform(0.0, 0.1),
                rng.uniform(0.0, 0.15),
                rng.uniform(0.1, 0.4),
                rng.uniform(100, 2000),
            ])
            y.append(2)

        # Road: elongated, low NDVI, high impervious
        for _ in range(n // 8):
            X.append([
                rng.uniform(500, 10000),
                rng.uniform(0.0, 0.15),
                rng.uniform(0.0, 0.2),
                rng.uniform(0.8, 1.0),
                rng.uniform(0.0, 0.05),
                rng.uniform(0, 5),
            ])
            y.append(3)

        # Water body: high water index
        for _ in range(n // 8):
            X.append([
                rng.uniform(1000, 100000),
                rng.uniform(0.2, 0.5),
                rng.uniform(0.0, 0.1),
                rng.uniform(0.0, 0.1),
                rng.uniform(0.7, 1.0),
                rng.uniform(50, 5000),
            ])
            y.append(4)

        # Forest: high NDVI, low density
        for _ in range(n // 8):
            X.append([
                rng.uniform(5000, 500000),
                rng.uniform(0.7, 1.0),
                rng.uniform(0.0, 0.05),
                rng.uniform(0.0, 0.1),
                rng.uniform(0.1, 0.3),
                rng.uniform(500, 10000),
            ])
            y.append(5)

        # Industrial
        for _ in range(n // 8):
            X.append([
                rng.uniform(2000, 20000),
                rng.uniform(0.05, 0.2),
                rng.uniform(0.4, 0.8),
                rng.uniform(0.5, 0.9),
                rng.uniform(0.0, 0.1),
                rng.uniform(20, 200),
            ])
            y.append(6)

        # Other
        for _ in range(n // 8):
            X.append([
                rng.uniform(100, 5000),
                rng.uniform(0.1, 0.6),
                rng.uniform(0.1, 0.6),
                rng.uniform(0.1, 0.6),
                rng.uniform(0.05, 0.3),
                rng.uniform(20, 500),
            ])
            y.append(7)

        import numpy as np
        return np.array(X), np.array(y)

    def train(self) -> dict:
        """Train the Random Forest classifier on simulated data."""
        try:
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import accuracy_score
            import numpy as np

            X, y = self._generate_training_data()
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            self._model = RandomForestClassifier(
                n_estimators=100, max_depth=10, random_state=42, n_jobs=-1
            )
            self._model.fit(X_train, y_train)
            preds = self._model.predict(X_test)
            self._accuracy = float(accuracy_score(y_test, preds))
            self._trained = True

            return {
                "accuracy": round(self._accuracy, 4),
                "samples": len(X),
                "classes": list(LABEL_MAP.values()),
                "note": "Trained on SIMULATED data only. Not suitable for real-world classification without labeled field data.",
            }
        except ImportError:
            self._trained = False
            return {"error": "scikit-learn not installed", "accuracy": None}

    def _try_load_or_train(self):
        """Attempt to train on startup."""
        try:
            self.train()
        except Exception:
            self._trained = False

    def predict_single(self, features: dict) -> dict:
        """Predict land use for a single feature vector."""
        if not self._trained or self._model is None:
            return {"label": "Unknown", "confidence": None, "error": "Model not trained"}
        try:
            import numpy as np
            vec = self._feature_dict_to_vector(features)
            arr = np.array([vec])
            pred_class = self._model.predict(arr)[0]
            proba = self._model.predict_proba(arr)[0]
            confidence = float(proba[pred_class])
            return {
                "label": LABEL_MAP.get(pred_class, "Other"),
                "confidence": round(confidence, 4),
                "class_id": int(pred_class),
            }
        except Exception as e:
            return {"label": "Unknown", "confidence": None, "error": str(e)}

    def predict_batch(self, features_list: list) -> list:
        return [self.predict_single(f) for f in features_list]

    def _feature_dict_to_vector(self, features: dict) -> list:
        return [
            float(features.get("area_sqm", 500)),
            float(features.get("ndvi", 0.3)),
            float(features.get("building_density", 0.3)),
            float(features.get("impervious_surface", 0.4)),
            float(features.get("water_index", 0.1)),
            float(features.get("road_distance_m", 100)),
        ]

    def model_info(self) -> dict:
        return {
            "trained": self._trained,
            "accuracy": round(self._accuracy, 4) if self._accuracy else None,
            "algorithm": "Random Forest",
            "feature_names": ["area_sqm", "ndvi", "building_density",
                               "impervious_surface", "water_index", "road_distance_m"],
            "classes": list(LABEL_MAP.values()),
            "training_data": "SIMULATED — indicative only",
            "disclaimer": (
                "Predictions are based on a model trained on synthetic data. "
                "Results require field verification by a qualified surveyor."
            ),
        }
