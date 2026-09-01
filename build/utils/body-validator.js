"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyValidator = void 0;
const zod_1 = require("zod");
const bodyValidator = 
// rome-ignore lint/suspicious/noExplicitAny: <explanation>
(schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const errors = error.issues.map((issue) => {
                const path = issue.path.join(".");
                const message = issue.message;
                return `${path ? `${path}: ` : ""}${message}`;
            });
            res.status(400).json({ errors });
        }
        else {
            console.error("Unexpected error during validation:", error);
            res.status(500).json({
                error: "Unexpected error during validation",
            });
        }
    }
};
exports.bodyValidator = bodyValidator;
