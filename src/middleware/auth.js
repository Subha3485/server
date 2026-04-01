import { createBadRequest } from "../services/logistics.js";
import { getIdentityFromAccessToken } from "../services/auth.js";

export function requireAuth(role) {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw createBadRequest("Bearer token is required.");
      }

      const token = header.slice("Bearer ".length);
      const auth = await getIdentityFromAccessToken(token);
      if (auth.role !== role) {
        throw createBadRequest("Token role mismatch.");
      }

      req.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
