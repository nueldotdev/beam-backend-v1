const generateMeetingCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const isValidMeetingCode = (code) => {
  return /^[A-Z0-9]{8}$/.test(code);
};

module.exports = {
  generateMeetingCode,
  isValidMeetingCode
};