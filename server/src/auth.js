const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JwtStrategy = require("passport-jwt").Strategy;
const { ExtractJwt } = require("passport-jwt");
const bcrypt = require("bcryptjs");
const { User } = require("./models");

const COOKIE_NAME = "taskflow_token";
const jwtSecret = () => process.env.JWT_SECRET || "taskflow-development-secret-change-before-deploy";

function cookieExtractor(request) {
  const cookies = request?.headers?.cookie || "";
  const tokenCookie = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!tokenCookie) return null;
  try {
    return decodeURIComponent(tokenCookie.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

passport.use(
  "local",
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
          return done(null, false, { message: "Email or password is incorrect." });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

passport.use(
  "jwt",
  new JwtStrategy(
    { jwtFromRequest: cookieExtractor, secretOrKey: jwtSecret() },
    async (payload, done) => {
      try {
        const user = await User.findById(payload.sub);
        return done(null, user || false);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

module.exports = { passport, COOKIE_NAME, jwtSecret, cookieExtractor };
