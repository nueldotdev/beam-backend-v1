const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const User = require("../models/User");

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.warn(`Missing environment variables: ${missingEnvVars.join(", ")}`);
}

const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "User with that email already exists" });
    }

    // Hash password and create user
    const hash = await bcrypt.hash(password, 10);
    const user = new User({
      profile: {
        firstName: firstName,
        lastName: lastName
      },
      email,
      password: hash,
      provider: "default",
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.status(201).json({ token, user: { id: user._id, email: user.email, profile: user.profile } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials - Please check username or password" });
    }

    // Check if user has a password (OAuth users won't)
    if (!user.password) {
      return res.status(401).json({ message: "This account uses OAuth. Please sign in with your provider." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials - Please check username or password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


// Google OAuth
// build the url frontend will use to kick off OAuth flow
const googleOAuthUrl = (req, res) => {
  const parameters = {
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent"
  };

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(parameters).toString()}`;
  return res.json({ url });
};

// callback handler - exchanges code for tokens and logs/creates the user
const googleOAuthHandler = async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ message: "Authorization code is required" });
  }

  try {
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { id_token } = tokenResponse.data;
    // decode JWT (it's not verified here since google already signed it)
    const decoded = jwt.decode(id_token);
    if (!decoded || !decoded.email) {
      return res.status(500).json({ message: "Failed to decode Google id_token" });
    }

    // upsert user based on providerId (Google's unique user ID)
    let user = await User.findOne({ providerId: decoded.sub });
    if (!user) {
      user = new User({
        email: decoded.email,
        provider: "google",
        providerId: decoded.sub, // Google's unique user ID
        profile: {
          firstName: decoded.given_name,
          lastName: decoded.family_name,
        },
      });
      await user.save();
    } else {
      // Update profile on re-login in case user changed their name in Google
      user.profile.firstName = decoded.given_name;
      user.profile.lastName = decoded.family_name;
      await user.save();
    }

    // issue our own JWT
    const appToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    return redirect(`${process.env.BEAM_FRONTEND_URL}/oauth-success?token=${appToken}&user=${JSON.stringify({ id: user._id, email: user.email, profile: user.profile })}`);

  } catch (error) {
    console.error("Google OAuth error", error.response?.data || error.message);
    return res.status(500).json({ message: "Google OAuth failed" });
  }
};


module.exports = { register, login, googleOAuthUrl, googleOAuthHandler };
