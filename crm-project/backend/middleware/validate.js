function validate(schema, target = "body") {
  return (req, res, next) => {
    req[target] = schema.parse(req[target]);
    next();
  };
}

module.exports = { validate };
