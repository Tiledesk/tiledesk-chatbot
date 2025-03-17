require('dotenv').config();
var appRoot = require('app-root-path');
var winston = require('winston');
var level = process.env.LOG_LEVEL || "info";

var options = {
  file: {
    level:level ,
    filename: `${appRoot}/logs/app.log`,
    handleExceptions: true,
    json: false,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    colorize: false,
    format: winston.format.simple()
  },
  console: {
    level: level,
    handleExceptions: true,
    json: true,
    colorize: true,
    // timestamp: true,
    format: winston.format.simple()     
  },
};

let logger = winston.createLogger({    
  transports: [
   new (winston.transports.Console)(options.console),
   new (winston.transports.File)(options.file),
  ],
  exitOnError: false, // do not exit on handled exceptions
});

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  },
};


module.exports = logger;
