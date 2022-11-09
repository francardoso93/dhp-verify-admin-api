/* eslint-disable max-len */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const axios = require('axios');
const rax = require('retry-axios');
const passwordGen = require('generate-password');
const querystring = require('querystring');
const iamHelper = require('./iam-helper');
const constants = require('./constants');
const config = require('../config');
const Logger = require('../config/logger');

const logger = new Logger('app-id-helper');

const baseUrl = process.env.APP_ID_AUTH_SERVER_HOST;
const clientID = process.env.APP_ID_CLIENT_ID;
const tenantID = process.env.APP_ID_TENANT_ID;
const secret = process.env.APP_ID_SECRET;
const useDummyPassword = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

// writer's responsibility to call validateConfig() before making requests to AppID
// eslint-disable-next-line complexity
const validateConfig = () => {
    let missingVar;
    if (!baseUrl) {
        missingVar = 'APP_ID_AUTH_SERVER_HOST';
    } else if (!clientID) {
        missingVar = 'APP_ID_CLIENT_ID';
    } else if (!tenantID) {
        missingVar = 'APP_ID_TENANT_ID';
    } else if (!secret) {
        missingVar = 'APP_ID_SECRET';
    }

    if (missingVar) {
        throw new Error(`Invalid AppID config: missing variable '${missingVar}'`);
    }
};

const defaultRaxConfig = (axiosClient) => {
    return {
        instance: axiosClient,
        retry: config.appID.retries || 1,
        backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
        noResponseRetries: config.appID.retries || 1, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
        retryDelay: config.appID.retryDelay || 3000,
        httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from AppID, retrying');
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`);
        },
    };
}
const appIdCustomAttributesClient = () => {
    // Need user's access token for adding User attribute
    const axClient = axios.create({
        baseURL: `${baseUrl}/api/v1/attributes`,
        timeout: config.appID.timeout,
        headers: {
            'Content-Type': 'text/plain',
            Accept: 'application/json',
        },
    });

    // setup retry-axios config
    axClient.defaults.raxConfig = defaultRaxConfig;
    rax.attach(axClient);
    return axClient;
}
const userAttributeClient = appIdCustomAttributesClient();

const appIdLoginClient = () => {
    const loginClient = axios.create({
        baseURL: `${baseUrl}/oauth/v4/${tenantID}/token`,
        timeout: config.appID.timeout,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
        },
        auth: {
            username: clientID,
            password: secret,
        },
    });

    const retries = config.appID.retries || 1;
    const retryDelay = config.appID.retryDelay || 3000;

    // setup retry-axios config
    loginClient.defaults.raxConfig = {
        instance: loginClient,
        retry: retries,
        backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
        noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
        retryDelay,
        httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from AppID, retrying login request:');
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`);
        },
    };

    rax.attach(loginClient);
    return loginClient;
};

const appIdMgmtClient = async () => {
    validateConfig();

    const token = await iamHelper.getIamToken();

    const axClient = axios.create({
        baseURL: `${baseUrl}/management/v4/${tenantID}`,
        timeout: config.appID.timeout,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: token,
        },
    });

    const retries = config.appID.retries || 1;
    const retryDelay = config.appID.retryDelay || 3000;

    // setup retry-axios config
    axClient.defaults.raxConfig = {
        instance: axClient,
        retry: retries,
        backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
        noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
        retryDelay,
        httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from AppID, retrying');
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`);
        },
    };

    rax.attach(axClient);
    return axClient;
};

const appIdUserInfoClient = (token) => {
    const axClient = axios.create({
        baseURL: `${baseUrl}/oauth/v4/${tenantID}/userInfo`,
        timeout: config.appID.timeout,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: token,
        },
    });

    const retries = config.appID.retries || 1;
    const retryDelay = config.appID.retryDelay || 3000;

    // setup retry-axios config
    axClient.defaults.raxConfig = {
        instance: axClient,
        retry: retries,
        backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
        noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
        retryDelay,
        httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from AppID, retrying');
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`);
        },
    };

    rax.attach(axClient);
    return axClient;
}


const loginAppID = async (username, password) => {
    try {
        validateConfig();
        const loginClient = appIdLoginClient();

        const requestBody = {
            username,
            password,
            grant_type: 'password',
        };

        logger.debug('Calling AppID to retrieve auth token');
        const response = await loginClient.post('/', querystring.stringify(requestBody));
        logger.info('Login request to AppID was successful');

        return response.data;
    } catch (error) {
        logger.info(`Login request to AppID failed:  ${error.message}`);
        const errorObj = new Error();
        if (error.response) {
            const errorResponse = error.response;
            errorObj.status = errorResponse.status;
            errorObj.statusText = errorResponse.statusText;
            if ('data' in errorResponse) {
                errorObj.message = errorResponse.data.error_description;
            }
        } else {
            errorObj.status = 500;
            errorObj.statusText = error.code;
            errorObj.message = error.message;
        }
        throw errorObj;
    }
};

const addUserCustomAttributes = async (customerId, orgId, email, password) => {
    if (customerId) {

        const authObject = await loginAppID(email, password);
        if (authObject.access_token) {
            const authHeader = {
                headers: {
                    Authorization: `Bearer ${authObject.access_token}`
                }
            }
            logger.debug(`userAttribute customerId ${customerId}`);
            const textBody = customerId;
            await userAttributeClient.put(`/${constants.USER_ATTRIBUTE_NAMES.CUSTOMER_ID}`,
                textBody,
                authHeader);

            // if res success
            if (orgId) {
                logger.debug(`userAttribute orgId ${orgId}`);
                const textBody = orgId;
                await userAttributeClient.put(`/${constants.USER_ATTRIBUTE_NAMES.ORG_ID}`,
                    textBody,
                    authHeader);
            }
        } // access_token
        else {
            logger.error(`User auth failed, userAttribute cannot be added.`);
        }
    }
}

const getUserInfoJwt = () => ({
    // eslint-disable-next-line max-len
    sub: '1d44cdc1-4b78-4ef7-a5a2-08aabc13619f',
    name: 'Tester POC',
    email: 'tester@poc.com',
    given_name: 'Tester',
    family_name: 'POC',
});

const getUserInfoAppId = async (token) => {
    try {
        validateConfig();
        const appIdInfo = appIdUserInfoClient(token);
        const userInfo = await appIdInfo.post('/');
        return userInfo.data;
    } catch (error) {
        logger.error(`Userinfo request to AppID failed with error ${error}`);

        const errorObj = new Error();
        if (error.response) {
            errorObj.status = error.response.status;
            errorObj.statusText = error.response.statusText;
            if ('data' in error.response)
                errorObj.message = error.response.data.error_description;
        } else {
            errorObj.status = 500;
            errorObj.statusText = error.code;
            errorObj.message = error.message;
        }

        throw errorObj;
    }
};

const getUserInfo = async (token) => {
    return process.env.AUTH_STRATEGY === 'DEVELOPMENT' ? getUserInfoJwt() : getUserInfoAppId(token);
};

const getRoleNames = (roleName) => {
    switch (roleName) {
    case 'sysadmin':
        return ['verifier-sysadmin', 'verifier-custadmin', 'verifier-orgadmin', 'credential-revoker', 'meter-reporter'];
    case 'custadmin':
        return ['verifier-custadmin', 'verifier-orgadmin', 'credential-revoker', 'meter-reporter'];
    case 'orgadmin':
        return ['verifier-orgadmin', 'credential-revoker'];
    case 'reporter':
        return ['meter-reporter'];
    default:
        return [];
    }
}

const getRoleIds = async (client, roleNames) => {

    const appIdRoles = await client.get(`/roles`);
    const allRoles = appIdRoles.data.roles;

    const filteredRoles = roleNames.map((name) => {
        return allRoles.find(role => role.name === name)
    })

    return filteredRoles.map((role) => role.id);
}

const createScope = async (clientId, scopeName) => {
    logger.debug(`Updating Application Scopes`);
    // TODO: currently we are passing in the scopeName, 
    // but if we change this approach in the future we need to ensure it's < 20 characters

    const client = await appIdMgmtClient();
    const currentScopes = await client.get(`/applications/${clientId}/scopes`);

    if (currentScopes.data.scopes.includes(scopeName)) {
        logger.debug(`Application Scopes already includes ${scopeName}`);
        return currentScopes;
    }

    const newScopes = [...currentScopes.data.scopes, scopeName];
    return client.put(`/applications/${clientId}/scopes`, { scopes: newScopes })
}

const sendResetPasswordEmail = async (userId) => {
    const client = await appIdMgmtClient();

    if (!userId) { return }

    const body = `uuid=${userId}`;
    await client.post(
        "/cloud_directory/resend/RESET_PASSWORD",
        body,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
}

const assignRoleToUserProfile = async (client, profileId, role) => {

    const roleIdNames = getRoleNames(role);  // given a base role, return a list app-specific names
    const roleIds = await getRoleIds(client, roleIdNames); // given a list of app-specific names, return and array of ids


    const roles = await client.get(`/users/${profileId}/roles`);
    const currentRoles = roles.data.roles || [];

    const existingRoleIds = currentRoles.reduce((acc, roleObj) => {
        acc.push(roleObj.id)
        return acc;
    }, []);

    const mergedRoleIds = [...new Set([...existingRoleIds, ...roleIds])]

    const body = { roles: { ids: mergedRoleIds } }

    await client.put(`/users/${profileId}/roles`, body);
}

const createUser = async (email, firstName, lastName, userPassword, role, customerId, orgId) => {
    logger.debug(`Creating user with email: ${email}`);

    const password = (userPassword || ((useDummyPassword) ? 'testing123' :
        passwordGen.generate({ length: 15, numbers: true, upperCase: true, symbols: true, strict: true })));

    const client = await appIdMgmtClient();
    const reqBody = {
        active: true,
        emails: [{ value: email, primary: true }],
        userName: email,
        password,
        name: {
            givenName: firstName,
            familyName: lastName,
        },
        status: "CONFIRMED"   // if CONFIRMED, no welcome email is sent to the user.
    };

    const existsResponse = await client.get(`/cloud_directory/Users?query=${email}`);

    // IMPORTANT: We can not onboard the same user twice.
    if (existsResponse && existsResponse.data && existsResponse.data.totalResults > 0) {
        const error = { statusCode: 409, message: `Specified User email already exists.` }
        throw error;
    }

    const createResponse = await client.post("/cloud_directory/sign_up?shouldCreateProfile=true&language=en", reqBody);
    const { data } = createResponse;

    try {
        await assignRoleToUserProfile(client, data.profileId, role);
        logger.debug(`Appid: ${email} , added role ${role}`);
    } catch (error) {
        const errMessage = "Failed to associate Role to User";
        logger.error(`${errMessage} :: ${error.message}`);
        error.message = errMessage;
        throw error;
    }

    try {
        // add custom attributes customer_id, org_id
        await addUserCustomAttributes(customerId, orgId, email, password);
    } catch (error) {
        const errMessage = "Failed to add custom attributes for User";
        logger.error(`${errMessage} :: ${error.message}`);
        error.message = errMessage;
        throw error;
    }

    try {
        if (!userPassword && !useDummyPassword) {
            sendResetPasswordEmail(data.id);
        }
    } catch (error) {
        const errMessage = "Failed to send reset password email to User";
        logger.error(`${errMessage} :: ${error.message}`);
        error.message = errMessage;
        throw error;
    }

    return {
        uId: data.id,
        pId: data.profileId
    }
}




const deleteUserByEmail = async (email) => {
    logger.debug(`AppID Delete User with email`);

    const client = await appIdMgmtClient();
    const response = await client.get(`/cloud_directory/Users?query=${email}`);
    const userId = (response && response.data && response.data.Resources && response.data.Resources.length > 0)
        ? response.data.Resources[0].id
        : undefined;

    if (userId) {
        await client.delete(`/cloud_directory/remove/${userId}`);
        logger.debug(`User ${userId} deleted.`);
    } else {
        logger.info(`Could not find User with given email`);
    }
    return userId;
};

const getUser = async (userId) => {
    logger.debug(`AppID Get UserId: ${userId}`);
    if (!userId) {
        const err = { statusCode: 400, message: `UserId must be specified` }
        throw err;
    }
    const client = await appIdMgmtClient();

    const userInfo = await client.get(`/cloud_directory/Users/${userId}`);
    logger.debug(`User ${userId} retrieved.`);
    return userInfo.data;
};

const deleteUser = async (userId) => {
    logger.debug(`AppID Delete UserId: ${userId}`);
    if (!userId) {
        const err = { statusCode: 400, message: `UserId must be specified` }
        throw err;
    }
    const client = await appIdMgmtClient();

    await client.delete(`/cloud_directory/remove/${userId}`);
    logger.debug(`User ${userId} deleted.`);

};

const createRole = async (clientId, roleName, scopeName) => {
    logger.debug(`Creating role ${roleName} , scope ${scopeName}`);

    const client = await appIdMgmtClient();

    const roles = await client.get(`/roles`);
    const currentRoles = roles.data.roles || [];

    // check to see if role already assigned to user, if so, just return
    const found = currentRoles.find(role => role.name === roleName)
    if (found) { return found.id }

    const body = {
        name: roleName,
        description: "",
        access: [
            {
                application_id: clientId,
                scopes: [scopeName]
            }
        ]
    }

    const response = await client.post(`/roles`, body);
    return response.data.id;
}

const deleteRole = async (roleName) => {
    logger.debug(`Deleting Role with name ${roleName}`);

    const client = await appIdMgmtClient();
    const response = await client.get(`/roles?name=${roleName}`);
    const currentRoles = (response && response.data && response.data.roles) ? response.data.roles : [];

    const role = currentRoles.find(role => role.name === roleName);

    if (role && role.id) {
        await client.delete(`/roles/${role.id}`);
        logger.debug(`Role ${roleName} deleted.`);
    } else {
        logger.debug(`Could not find Role with name: ${roleName}`);
    }
}

const removeScope = async (clientId, scopeName) => {
    logger.debug(`Removing Application Scope with name: ${scopeName}`);

    const client = await appIdMgmtClient();
    const response = await client.get(`/applications/${clientId}/scopes`);
    const currentScopes = response.data.scopes || [];
    const removeIndex = currentScopes.indexOf(scopeName);

    if (currentScopes.length > 0 && removeIndex >= 0) {
        currentScopes.splice(removeIndex, 1)
        await client.put(`/applications/${clientId}/scopes`, { scopes: currentScopes })
        logger.debug(`Application Scope ${scopeName} deleted.`);
    } else {
        logger.debug(`Could not find Scope with name: ${scopeName}`);
    }
}

module.exports = {
    loginAppID,
    getUserInfo,
    getUser,
    createScope,
    sendResetPasswordEmail,
    createUser,
    deleteUser,
    deleteUserByEmail,
    createRole,
    deleteRole,
    removeScope
};
