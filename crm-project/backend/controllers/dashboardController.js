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
        let pendingDocs = 0;
        let pendingApproval = 0;

        let totalCollected = 0;
        let totalPending = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const totalPayment = data.totalPayment || 0;
            total++;
            if (data.stage === 2) pendingDocs++;
            if ([4,5,7,9].includes(data.stage)) pendingApproval++;

            const stage = data.stage || 1;
            stageCounts[stage] = (stageCounts[stage] || 0) + 1;

            const payments = data.payments || [];

            let paid = 0;

            payments.forEach(p => {
            paid += p.amount || 0;
            });

            totalCollected += paid;
            totalPending += (totalPayment - paid);

            if (stage >= 12) completed++;
            else ongoing++;
        });

        res.json({
            totalApplicants: total,
            completed,
            ongoing,
            stageCounts,
            alerts: {
                pendingDocs,
                pendingApproval: pendingApproval // or just pendingApproval
                },
            payments: {
                totalCollected,
                totalPending
                }
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

