# 🛰️ NASA Space Apps - SpaceH Backend Motor Científico de Análogos Terrestres

* **Overview:** **SpaceH** is an interactive 3D web platform—developed by Alberto Muñoz Lombardo, Sara González Rodríguez, Renato Ramirez Vida, Manuel Solera López, Óscar Castellano Orihuela, and Paula Gualda Molina—that identifies Earth analogs for Mars regions and potential permanent Moon base sites.
* **Data Harmonization & Variables:** Processes planetary datasets independently on $120 \times 120\text{ km}$ sinusoidal equal-area grids (retaining $5^\circ$ resolution for annual GHI) to build a 3-feature search vector $\mathbf{x} = (A, Q, H)$:
* **Albedo ($A$):** Mean surface reflectivity.
* **Absorbed Solar Flux ($Q$):** Derived as $Q = (1-A)G$ in $\text{W m}^{-2}$ (with 24-hour equivalent energy $E_{24}$ kept as context).
* **Regional Relief ($H$):** Population standard deviation of mean elevations within a $300\text{ km}$ geodesic radius.


* **Filtering & Normalization:** Filters out ineligible Earth cells using vegetation, water, and urban fractions, and normalizes features per planet via z-scores (or empirical percentiles) across $10^\circ$ spatial blocks ($60/20/20\%$ calibration/development/test split).
* **Similarity Algorithms:** Combines K-means clustering ($K \in \{3, 5, 8\}$, selected via silhouette score) for optional prefiltering with exact weighted Euclidean K-nearest neighbors ($k = 10$) to retrieve the closest Earth analogs.
* **Future Improvements:** Plans to introduce Ledoit-Wolf regularized Mahalanobis distance (to account for correlation between $A$ and $Q$) and two-stage spatial refinement to subdivide shortlisted $120\text{ km}$ cells into higher-resolution local patches.
* **Web Architecture:** Uses a two-tier setup pairing **Render** (frontend hosting and JSON payload generation) with **Hugging Face** (dataset storage and algorithm execution, bypassing Vercel's 5-minute runtime limit).
* **3D User Interface:** Displays an interactive 3D globe of Mars or the Moon where users select coordinates by clicking or manual input, adjust variable weights with sliders, and inspect the closest Earth match with a full metric breakdown.
* **Impact:** Reduces space mission costs and risks by identifying terrestrial testbeds for equipment testing and astronaut training, while making NASA datasets accessible to non-programmers.