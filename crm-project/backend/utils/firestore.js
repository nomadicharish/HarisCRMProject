function mapSnapshot(snapshot) {
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

module.exports = { mapSnapshot };
