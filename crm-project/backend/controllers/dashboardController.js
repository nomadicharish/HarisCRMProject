const { db } = require("../config/firebase");

exports.getDashboard = async (req, res) => {
    try {

        const role = req.user.role;
        const userId = req.user.uid;

        const { companyId, agencyId, fromDate, toDate } = req.query;

        let query = db.collection("applicants");

        // 🔒 ROLE FILTER
        if (role === "AGENCY") {
            query = query.where("agencyId", "==", req.user.agencyId);
        }

        if (role === "EMPLOYER") {
            query = query.where("employerIds", "array-contains", userId);
        }

        // 🔍 FILTERS
        if (companyId) {
            query = query.where("companyId", "==", companyId);
        }

        if (agencyId) {
            query = query.where("agencyId", "==", agencyId);
        }

        if (fromDate) {
            query = query.where("createdAt", ">=", new Date(fromDate));
        }

        if (toDate) {
            query = query.where("createdAt", "<=", new Date(toDate));
        }

        const snapshot = await query.get();

        let total = 0;
        let completed = 0;
        let ongoing = 0;

        const stageCounts = {};

        snapshot.forEach(doc => {
            const data = doc.data();

            total++;

            const stage = data.stage || 1;

            stageCounts[stage] = (stageCounts[stage] || 0) + 1;

            if (stage >= 12) completed++;
            else ongoing++;
        });

        console.log("ROLE:", role);
        console.log("USER:", req.user);

        res.json({
            totalApplicants: total,
            completed,
            ongoing,
            stageCounts
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

