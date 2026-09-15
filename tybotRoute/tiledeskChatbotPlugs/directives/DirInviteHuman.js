const SEPARATORS = /[,;\n]/;
const SINGLE_PLACEHOLDER = /^\{\{\s*([\w.]+)\s*\}\}$/;

class DirInviteHuman {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
  }

  /**
   * Resolves the "members" field of the action into a list of ids/emails.
   * A token that is exactly one {{variable}} is replaced by the raw variable value
   * (arrays are expanded); other tokens containing {{...}} are rendered with the Filler.
   */
  static resolveMembers(rawMembers, variables, filler) {
    const vars = variables || {};
    const result = [];

    const push = (value) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(push);
        return;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              parsed.forEach(push);
              return;
            }
          } catch (err) {
            // not a JSON array: treat as plain text
          }
        }
        trimmed.split(SEPARATORS).map((s) => s.trim()).filter((s) => s.length > 0).forEach((s) => {
          if (!result.includes(s)) {
            result.push(s);
          }
        });
        return;
      }
      push(String(value));
    };

    if (rawMembers === undefined || rawMembers === null) {
      return result;
    }
    const tokens = Array.isArray(rawMembers) ? rawMembers : String(rawMembers).split(SEPARATORS);
    for (const token of tokens) {
      if (typeof token !== 'string') {
        push(token);
        continue;
      }
      const trimmed = token.trim();
      if (!trimmed) {
        continue;
      }
      const placeholder = trimmed.match(SINGLE_PLACEHOLDER);
      if (placeholder) {
        push(DirInviteHuman.lookup(vars, placeholder[1]));
      } else if (trimmed.includes('{{') && filler) {
        push(filler.fill(trimmed, Object.assign({}, vars)));
      } else {
        push(trimmed);
      }
    }
    return result;
  }

  static lookup(variables, path) {
    return path.split('.').reduce((obj, key) => (obj !== undefined && obj !== null ? obj[key] : undefined), variables);
  }

  static fixToken(token) {
    if (!token) {
      return token;
    }
    return token.startsWith('JWT ') ? token : 'JWT ' + token;
  }
}

module.exports = { DirInviteHuman };
