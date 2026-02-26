const Joi = require('joi');

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map((d) => d.message),
      });
    }

    req[property] = value;
    next();
  };
};

const createMeetingSchema = Joi.object({
  title: Joi.string().max(100).optional(),
  settings: Joi.object({
    waitingRoom: Joi.boolean().default(true),
    allowDownload: Joi.boolean().default(true)
  }).optional()
});

const joinMeetingSchema = Joi.object({
  meetingId: Joi.string().required(),
  displayName: Joi.string().min(2).max(50).required()
});

const updateMeetingSchema = Joi.object({
  title: Joi.string().max(100).optional(),
  settings: Joi.object({
    waitingRoom: Joi.boolean(),
    locked: Joi.boolean(),
    allowDownload: Joi.boolean()
  }).optional()
});

module.exports = {
  createMeetingSchema,
  validate, 
  joinMeetingSchema,
  updateMeetingSchema
};