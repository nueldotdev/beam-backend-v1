const Meeting = require('../models/Meeting');
const Participant = require('../models/Participant');
const { generateMeetingCode } = require('../utils/meetingCode');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// 8x8 JaaS Credentials and Settings
const JAAS_APP_ID = process.env.JAAS_APP_ID ? process.env.JAAS_APP_ID.trim() : '';
const JAAS_API_KEY = process.env.JAAS_API_KEY;
// Note: In production, the private key should be loaded securely, perhaps from a file or secure vault.
// For now, we'll expect it as an environment variable (often with \n replacements).
const JAAS_PRIVATE_KEY = process.env.JAAS_PRIVATE_KEY ? process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

// @desc    Generate JaaS JWT Token
// @route   GET /api/v1/meetings/:id/jaas-jwt
// @access  Private
const getJaasJwt = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Generate an ephemeral ObjectId for guests who passed through optionalAuth
    const userId = req.user ? req.user._id : new mongoose.Types.ObjectId();

    if (!JAAS_APP_ID || !JAAS_API_KEY || !JAAS_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        message: 'JaaS credentials are not fully configured on the server.'
      });
    }

    let isHost = true;

    // Safely attempt to find the meeting to check host status, but don't fail if it's an ad-hoc room string
    if (id && id !== 'new') {
        let meeting = null;
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            meeting = await Meeting.findById(id);
        } else {
            meeting = await Meeting.findOne({ meetingCode: id });
        }
        
        if (meeting && req.user) {
            isHost = meeting.hostUserId.toString() === userId.toString();
        } else if (meeting && !req.user) {
            isHost = false; // Guests cannot be hosts
        }
    }

    const isModerator = isHost;

    const requestedName = req.query.name;

    const authPayload = {
      context: {
        user: {
          avatar: req.user?.profile?.avatar || '',
          name: requestedName || req.user?.name || (req.user?.email ? req.user.email : 'Guest'),
          email: req.user?.email || '',
          id: userId.toString(),
          moderator: isModerator ? 'true' : 'false',
        },
        features: {
          livestreaming: true,
          recording: true,
          transcription: true,
          'outbound-call': true,
          lobby: false,
        },
      },
      aud: 'jitsi',
      iss: 'chat',
      sub: JAAS_APP_ID,
      room: '*', // Or restrict to meetingCode
      // Kid format: appId/apiKey
    };

    const token = jwt.sign(authPayload, JAAS_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '2h',
        header: {
            kid: JAAS_API_KEY.includes('/') ? JAAS_API_KEY : `${JAAS_APP_ID}/${JAAS_API_KEY}`
        }
    });

    res.json({
        success: true,
        data: {
            token,
            appId: JAAS_APP_ID,
        }
    });
  } catch (error) {
     console.error("Error generating JaaS JWT:", error);
     next(error);
  }
};


// @desc    Create a new meeting
// @route   POST /api/meetings
// @access  Private
const createMeeting = async (req, res, next) => {
  try {
    const { title, settings } = req.body;
    const userId = req.user._id;

    // Generate unique meeting code
    let meetingCode;
    let isUnique = false;
    while (!isUnique) {
      meetingCode = generateMeetingCode();
      const existing = await Meeting.findOne({ meetingCode });
      if (!existing) isUnique = true;
    }

    // Create meeting
    const meeting = await Meeting.create({
      title: title || 'Untitled Meeting',
      meetingCode,
      hostUserId: userId,
      settings: {
        waitingRoom: settings?.waitingRoom ?? true,
        allowDownload: settings?.allowDownload ?? true,
        locked: false
      },
      status: 'active',
      startedAt: new Date()
    });

    // Add host as participant
    await Participant.create({
      meetingId: meeting._id,
      userId,
      displayName: req.user.name || (req.user.email ? req.user.email.split('@')[0] : 'Guest'),
      role: 'host'
    });

    res.status(201).json({
      success: true,
      data: {
        meeting,
        joinUrl: `${process.env.CLIENT_URL}/meet/${meetingCode}`
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get meeting by ID
// @route   GET /api/v1/meetings/:id
// @access  Private
const getMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('hostUserId', 'name email profile')
      .lean();

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Get active participants
    const participants = await Participant.find({
      meetingId: meeting._id,
      leftAt: null
    }).populate('userId', 'name email profile');

    res.json({
      success: true,
      data: {
        ...meeting,
        participants
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all meetings for user
// @route   GET /api/v1/meetings
// @access  Private
const getMeetings = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { filter = 'all', page = 1, limit = 10 } = req.query;

    let query = {};
    
    if (filter === 'hosted') {
      query.hostUserId = userId;
    } else if (filter === 'attended') {
      // Find meetings user participated in
      const participatedMeetings = await Participant.find({ 
        userId, 
        role: 'participant' 
      }).distinct('meetingId');
      query._id = { $in: participatedMeetings };
    } else {
      // All meetings user is involved in (host or participant)
      const participatedMeetings = await Participant.find({ 
        userId 
      }).distinct('meetingId');
      query.$or = [
        { hostUserId: userId },
        { _id: { $in: participatedMeetings } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const meetings = await Meeting.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('hostUserId', 'name email')
      .lean();

    const total = await Meeting.countDocuments(query);

    // Get participant counts for each meeting
    const meetingsWithStats = await Promise.all(
      meetings.map(async (meeting) => {
        const participantCount = await Participant.countDocuments({
          meetingId: meeting._id,
          leftAt: null
        });
        return {
          ...meeting,
          activeParticipants: participantCount
        };
      })
    );

    res.json({
      success: true,
      data: meetingsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Join a meeting
// @route   POST /api/v1/meetings/:id/join
// @access  Private
const joinMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName } = req.body;
    const userId = req.user ? req.user._id : null;

    const meeting = await Meeting.findById(id);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    if (meeting.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Meeting is not active'
      });
    }

    if (meeting.settings?.locked) {
      return res.status(403).json({
        success: false,
        message: 'Meeting is locked'
      });
    }

    // Check if already joined (Only for registered users)
    let participant = null;
    if (userId) {
      participant = await Participant.findOne({
        meetingId: id,
        userId,
        leftAt: null
      });
    }

    if (participant) {
      // Update existing participant
      participant.isOnline = true;
      participant.displayName = displayName || participant.displayName;
      await participant.save();
    } else {
      // Create new participant
      participant = await Participant.create({
        meetingId: id,
        userId: userId || undefined, // guest participants have undefined userId
        displayName: displayName || req.user?.name || (req.user?.email ? req.user.email.split('@')[0] : 'Guest'),
        role: (userId && meeting.hostUserId.toString() === userId.toString()) ? 'host' : 'participant'
      });

      // Increment participant count
      await Meeting.findByIdAndUpdate(id, {
        $inc: { participantCount: 1 }
      });
    }

    res.json({
      success: true,
      data: {
        meeting,
        participant
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Leave a meeting
// @route   POST /api/v1/meetings/:id/leave
// @access  Private
const leaveMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null;

    if (!userId) {
       // Guests don't have tracked Participant records by UserID to leave
       return res.json({ success: true, message: 'Guest left meeting successfully' });
    }

    const participant = await Participant.findOneAndUpdate(
      { meetingId: id, userId, leftAt: null },
      { 
        leftAt: new Date(),
        isOnline: false 
      },
      { new: true }
    );

    if (participant) {
      // Decrement participant count
      await Meeting.findByIdAndUpdate(id, {
        $inc: { participantCount: -1 }
      });
    }

    res.json({
      success: true,
      message: 'Left meeting successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update meeting
// @route   PATCH /api/v1/meetings/:id
// @access  Private (Host only)
const updateMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findById(id);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user is host
    if (meeting.hostUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only host can update meeting'
      });
    }

    const updatedMeeting = await Meeting.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedMeeting
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete meeting
// @route   DELETE /api/v1/meetings/:id
// @access  Private (Host only)
const deleteMeeting = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findById(id);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user is host
    if (meeting.hostUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only host can delete meeting'
      });
    }

    // Soft delete or hard delete?
    await Meeting.findByIdAndUpdate(id, { status: 'ended', endedAt: new Date() });
    
    // Mark all participants as left
    await Participant.updateMany(
      { meetingId: id, leftAt: null },
      { leftAt: new Date(), isOnline: false }
    );

    res.json({
      success: true,
      message: 'Meeting ended successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get meeting info by code (public)
// @route   GET /api/v1/meetings/code/:code/info
// @access  Public
const getMeetingInfo = async (req, res, next) => {
  try {
    const { code } = req.params;

    const meeting = await Meeting.findOne({ meetingCode: code })
      .populate('hostUserId', 'name email')
      .lean();

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Get current participants (anonymized)
    const participantCount = await Participant.countDocuments({
      meetingId: meeting._id,
      leftAt: null
    });

    res.json({
      success: true,
      data: {
        title: meeting.title,
        hostName: meeting.hostUserId.name,
        status: meeting.status,
        participantCount,
        settings: meeting.settings
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createMeeting,
  getMeeting,
  getMeetings,
  joinMeeting,
  leaveMeeting,
  updateMeeting,
  deleteMeeting,
  getMeetingInfo,
  getJaasJwt
};