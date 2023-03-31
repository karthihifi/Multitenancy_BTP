const cds = require('@sap/cds');
const debug = require('debug')('srv:server');
const cfenv = require('cfenv');
const appEnv = cfenv.getAppEnv();
const httpClient = require('@sap-cloud-sdk/http-client');
const dbClass = require('sap-hdbext-promisfied');
const xsenv = require('@sap/xsenv');
xsenv.loadEnv();

cds.on('bootstrap', app => app.use((req, res, next) => {
    next();
}));

cds.once('listening', async () => {
    console.log('Bootstrap Listening Mode Called')

    try {
        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
        let sql = `SELECT * FROM "jobschedtest.dbcommon::Vehicles"`;
        const statement = await db.preparePromisified(sql);
        const results = await db.statementExecPromisified(statement, []);
        console.log('Results from Execution', results)
        let job;

        if (results != undefined) {
            results.forEach((item) => {
                if (item.Active == true) {
                    console.log("CDS Spawn Clling", item.Tenant);
                    job = cds.spawn({ tenant: item.Tenant }, async (tx) => {
                        console.log('CDs Spawn called')
                        let Vehicles = await tx.run(SELECT.from('jobschedtest.db.VehiclesPurch'))
                        console.log('Vehicle Data', Vehicles)

                        // const { tenant, user } = cds.context.RootContext
                        const nwsco = await cds.connect.to('nw');
                        const { Products } = nwsco.entities
                        console.log(Products, "Entities", cds.context)
                        const tx1 = nwsco.transaction({ tenant: item.Tenant });
                        // console.log('Destination Query Start')
                        // const cats = await cds.connect.to('CatalogService')s
                        // const res2 = await cats.userInfo()
                        // tx.send('userInfo');
                        // const cqn = SELECT.from(Products)
                        // let result = await tx.read(Products)
                        let result = await tx1.get("/Products")
                        let Products1 = result;
                        // console.log('Destination Query Result', Products1)
                        // console.log(cds.context, "CDS Context")

                        // const cs = await cds.connect.to('CatalogService');
                        // let results = await cs.read(SELECT.from(VehiclesPurchased));
                    })
                    job.on('succeeded', () => { console.log('Job Calling Success') })
                    job.on('failed', () => { console.log('Job Calling Failure') })
                    job.on('done', () => { console.log('Job Calling Done') })
                }
            })
        }


        // return results;
    } catch (err) {
        console.error('Error Occured', err);
    }
});

async function getCFInfo(appname) {
    try {
        // get app GUID
        let res1 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
            method: 'GET',
            url: '/v3/apps?organization_guids=' + appEnv.app.organization_id + '&space_guids=' + appEnv.app.space_id + '&names=' + appname
        });
        // get domain GUID
        let res2 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
            method: 'GET',
            url: '/v3/domains?names=' + /\.(.*)/gm.exec(appEnv.app.application_uris[0])[1]
        });
        let results = {
            'app_id': res1.data.resources[0].guid,
            'domain_id': res2.data.resources[0].guid
        };
        return results;
    } catch (err) {
        console.log(err.stack);
        return err.message;
    }
};

async function createRoute(subscribedSubdomain, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // create route
                let res1 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
                    method: 'POST',
                    url: '/v3/routes',
                    data: {
                        'host': subscribedSubdomain + '-' + process.env.APP_URI.split('.')[0],
                        'relationships': {
                            'space': {
                                'data': {
                                    'guid': appEnv.app.space_id
                                }
                            },
                            'domain': {
                                'data': {
                                    'guid': CFInfo.domain_id
                                }
                            }
                        }
                    },
                });
                // map route to app
                let res2 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
                    method: 'POST',
                    url: '/v3/routes/' + res1.data.guid + '/destinations',
                    data: {
                        'destinations': [{
                            'app': {
                                'guid': CFInfo.app_id
                            }
                        }]
                    },
                });
                console.log('Route created for ' + subscribedSubdomain);
                return res2.data;
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        },
        function (err) {
            console.log(err.stack);
            return err.message;
        });
};

async function deleteRoute(subscribedSubdomain, appname) {
    getCFInfo(appname).then(
        async function (CFInfo) {
            try {
                // get route id
                let res1 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
                    method: 'GET',
                    url: '/v3/apps/' + CFInfo.app_id + '/routes?hosts=' + subscribedSubdomain + '-' + process.env.APP_URI.split('.')[0]
                });
                if (res1.data.pagination.total_results === 1) {
                    try {
                        // delete route
                        let res2 = await httpClient.executeHttpRequest({ destinationName: 'jobschedtest-cfapi' }, {
                            method: 'DELETE',
                            url: '/v3/routes/' + res1.data.resources[0].guid
                        });
                        console.log('Route deleted for ' + subscribedSubdomain);
                        return res2.data;
                    } catch (err) {
                        console.log(err.stack);
                        return err.message;
                    }
                } else {
                    let errmsg = { 'error': 'Route not found' };
                    console.log(errmsg);
                    return errmsg;
                }
            } catch (err) {
                console.log(err.stack);
                return err.message;
            }
        },
        function (err) {
            console.log(err.stack);
            return err.message;
        });
};

cds.on('served', () => {

    const { 'cds.xt.SaasProvisioningService': provisioning } = cds.services;
    provisioning.prepend(() => {

        provisioning.on('UPDATE', 'tenant', async (req, next) => {
            // let tenantURL = process.env.APP_PROTOCOL + ':\/\/' + req.data.subscribedSubdomain + '-' + process.env.APP_URI;
            let tenantURL = process.env.APP_PROTOCOL + ':\/\/' + req.data.subscribedSubdomain + '-' + 'jobschedtest-app' + '.' + process.env.APP_DOMAIN
            console.log('Subscribe:', req.data.subscribedSubdomain, req.data.subscribedTenantId, tenantURL);
            await next();
            const services = xsenv.getServices({
                registry: { label: 'saas-registry' }
            });
            createRoute(req.data.subscribedSubdomain, services.registry.appName + '-app').then(
                async function (res2) {
                    //Trying out DB
                    try {
                        let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
                        let sql = `SELECT COUNT(*) AS "count" FROM "jobschedtest.dbcommon::Vehicles"`;
                        const statement = await db.preparePromisified(sql);
                        const results = await db.statementExecPromisified(statement, []);
                        console.log('Query Results', results)
                        return results;
                    } catch (err) {
                        console.error('Error When Querying DB', err);
                    }
                    //Trying Out End
                    return tenantURL;
                },
                function (err) {
                    debug(err.stack);
                    return '';
                });
            return tenantURL;
        });

        provisioning.on('DELETE', 'tenant', async (req, next) => {
            console.log('Unsubscribe:', req.data.subscribedSubdomain, req.data.subscribedTenantId);
            await next();
            const services = xsenv.getServices({
                registry: { label: 'saas-registry' }
            });
            deleteRoute(req.data.subscribedSubdomain, services.registry.appName + '-app').then(
                async function (res2) {
                    return req.data.subscribedTenantId;
                },
                function (err) {
                    debug(err.stack);
                    return '';
                });
            return req.data.subscribedTenantId;
        });

        provisioning.on('dependencies', async (req, next) => {
            await next();
            const services = xsenv.getServices({
                dest: { label: 'destination' },
                jobscheduler: { label: 'jobscheduler' },
            });
            console.log('services to get:', services, services.jobscheduler);
            debug('Dependent services:', services);
            let dependencies = [{
                'xsappname': services.dest.xsappname
            },
            { 'xsappname': services.jobscheduler.uaa.xsappname }];

            // process.env.JBSCH_CLNTSEC = services.jobscheduler.uaa.clientsecret
            console.log('Dependencies:', dependencies);
            debug('Dependencies:', dependencies);
            return dependencies;
        });

    });

    /* upgrade tenant - override
    const { 'cds.xt.DeploymentService': deployment } = cds.services;
    deployment.prepend(() => {
        deployment.on('upgrade', async (req) => {
            console.log('UpgradeTenant:', req.data);
            return '';
        });
    });
    */

});

module.exports = cds.server;