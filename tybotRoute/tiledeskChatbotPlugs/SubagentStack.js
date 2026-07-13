class SubagentStack {

    constructor(options) {

        if (!options) {
            throw new Error('(SubagentStack) options object is mandatory.');
        }
        if (!options.tdCache) {
            throw new Error('(SubagentStack) options.tdCache object is mandatory.');
        }

        this.tdCache = options.tdCache;
    }

    static STACK_TTL_SECONDS = 60 * 60 * 24;

    static buildSnapshot(context, directives, resumeIndex) {
        return {
            parentBotId: context.supportRequest?.bot_id,
            projectId: context.projectId,
            requestId: context.requestId,
            token: context.token,
            directives: directives || [],
            resumeIndex: resumeIndex,
            reply: context.reply,
            message: context.message,
            supportRequest: {
                request_id: context.supportRequest?.request_id,
                id_project: context.supportRequest?.id_project,
                bot_id: context.supportRequest?.bot_id,
                draft: context.supportRequest?.draft,
                department: context.supportRequest?.department
            }
        };
    }

    stackKey(requestId) {
        return `subagent:stack:${requestId}`;
    }

    // Save parent state in the stack before calling the subagent
    async push(requestId, snapshot) {
        const key = this.stackKey(requestId);
        await this.tdCache.lPush(key, JSON.stringify(snapshot));
        await this.tdCache.expire(key, SubagentStack.STACK_TTL_SECONDS);
    }

    // Restore parent state from the stack after the subagent return
    async pop(requestId) {
        const key = this.stackKey(requestId);
        const value = await this.tdCache.lPop(key);

        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    // Look at the top of the stack without removing it
    async peek(requestId) {
        const key = this.stackKey(requestId);
        const value = await this.tdCache.lIndex(key, 0);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    // Number of elements in the stack
    async size(requestId) {
        const key = this.stackKey(requestId);
        const size = await this.tdCache.lLen(key);
        return size;
    }

    // Clear the stack
    async clear(requestId) {
        const key = this.stackKey(requestId);
        await this.tdCache.del(key);
    }

}

module.exports = SubagentStack;
