import mongoose from "mongoose";
import { HTTP_STATUS } from "../utils/constants.js";

/**
 * Middleware to validate MongoDB ObjectId in route parameters
 * @param {string} paramName - Name of the parameter to validate (default: 'id')
 */
export const validateObjectId = (paramName = "id") => {
  return (req, res, next) => {
    const value =
      req.params[paramName] ?? req.body[paramName] ?? req.query[paramName];

    console.log("validateObjectId:", {
      paramName,
      value,
      params: req.params,
      body: req.body,
      query: req.query,
    });

    if (!mongoose.Types.ObjectId.isValid(value)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
};
