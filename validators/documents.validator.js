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

const createDocumentSchema = Joi.object({
  meetingId: Joi.string().required(),
  filename: Joi.string().max(255).required(),
  fileType: Joi.string().valid('pdf').default('pdf'),
  fileUrl: Joi.string().uri().required(),
  size: Joi.number().integer().min(0).optional(),
  pageCount: Joi.number().integer().min(0).optional(),
  slides: Joi.array()
    .items(
      Joi.object({
        pageNumber: Joi.number().integer().min(1).required(),
        s3Key: Joi.string().optional(),
        url: Joi.string().uri().optional(),
        thumbnailUrl: Joi.string().uri().optional(),
        width: Joi.number().integer().min(0).optional(),
        height: Joi.number().integer().min(0).optional(),
      })
    )
    .optional(),
});

const updateDocumentSchema = Joi.object({
  filename: Joi.string().max(255).optional(),
  fileType: Joi.string().valid('pdf').optional(),
  fileUrl: Joi.string().uri().optional(),
  size: Joi.number().integer().min(0).optional(),
  pageCount: Joi.number().integer().min(0).optional(),
  slides: Joi.array().optional(),
  processingStatus: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed')
    .optional(),
  isActive: Joi.boolean().optional(),
});

module.exports = {
  validate,
  createDocumentSchema,
  updateDocumentSchema,
};