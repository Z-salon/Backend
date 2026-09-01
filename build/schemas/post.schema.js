"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostSchema = void 0;
const zod_1 = require("zod");
exports.createPostSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(255),
    content: zod_1.z.string().min(1).max(255),
    published: zod_1.z.boolean()
});
