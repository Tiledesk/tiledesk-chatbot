const redis = require('redis');

class TdCache {

    constructor(config) {
        this.redis_host = config.host;
        this.redis_port = config.port;
        this.redis_password = config.password;
        this.client = null;
    }

    async connect(callback) {
        // client = redis.createClient();
        return new Promise( async (resolve, reject) => {
            this.client = redis.createClient(
                {
                    host: this.redis_host,
                    port: this.redis_port,
                    password: this.redis_password
                });
            this.client.on('error', err => {
                console.log('Redis Error', err);
                reject(err);
                if (callback) {
                    callback(err);
                }
            });
            // this.client.on('connect', function() {
            //     console.log('Redis Connected!');
            // });
            this.client.on('ready',function() {
                resolve();
                if (callback) {
                    callback();
                }
                console.log("Redis is ready");
            });
        });
    }

    async set(key, value, options) {
        return new Promise( async (resolve, reject) => {
            if (options && options.EX) {
                console.log("expires:", options.EX)
                await this.client.set(
                    key,
                    value,
                    'EX', options.EX);
            }
            else {
                await this.client.set(
                    key,
                    value);
            }
            if (options && options.callback) {
                options.callback();
            }
            return resolve();
        });
    }

    async setJSON(key, value, options) {
        const _string = JSON.stringify(value);
        return await this.set(key, _string, options);
    }

    async get(key, callback) {
        return new Promise( async (resolve, reject) => {
            this.client.get(key, (err, value) => {
                if (callback) {
                    callback(value);
                }
                return resolve(value);
            });
        });
    }

    async getJSON(key, callback) {
        const value = await this.get(key);
        return JSON.parse(value);
    }

    async del(key, callback) {
        return new Promise( async (resolve, reject) => {
            await this.client.del(key);
            if (callback) {
                callback();
            }
            return resolve();
        })
    }
}

module.exports = { TdCache };