const cds = require('@sap/cds');
const debug = require('debug')('srv:server');
const cfenv = require('cfenv');
const appEnv = cfenv.getAppEnv();
const httpClient = require('@sap-cloud-sdk/http-client');
const dbClass = require('sap-hdbext-promisfied');
const xsenv = require('@sap/xsenv');
const axios = require('axios')
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
                        // console.log('CDs Spawn called')
                        let Vehicles = await tx.run(SELECT.from('jobschedtest.db.VehiclesPurch'))
                        // console.log('Vehicle Data', Vehicles)

                        const services = xsenv.getServices({
                            destination: { label: 'xsuaa' },
                        });

                        let jobSchclienSecret = services.destination.clientsecret

                        let Authurl = 'https://' + item.Domain + '.authentication.eu10.hana.ondemand.com/oauth/token'
                        var options = {
                            method: 'POST',
                            // url: 'https://poc-multi-tenancy-subscriber1-igfpa9w7.authentication.eu10.hana.ondemand.com/oauth/token',
                            //url: 'https://poc-multi-tenancy-subscriber2-iqndot9n.authentication.eu10.hana.ondemand.com/oauth/token',
                            url: Authurl,
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            data: {
                                client_id: 'sb-jobschedtest!t197539',    //'sb-clone3f51230f86c84f51a79e35fe28600836!b197539|destination-xsappname!b404',
                                client_secret: jobSchclienSecret,
                                grant_type: 'client_credentials'
                            }
                        };
                        // console.log(services, 'XSUAA', Authurl);

                        axios.request(options).then(async function (response) {
                            // console.log(response.data);
                            let Access_token = response.data.access_token

                            console.log('Query Start')
                            try {
                                let res1 = await httpClient.executeHttpRequest(
                                    {
                                        destinationName: 'jobschedtest-nw',
                                        jwt: Access_token
                                    },
                                    {
                                        method: 'GET',
                                        url: "/Products"
                                    }
                                );
                                let Cdsdata = { ...cds.context }
                                let Cdsdata1 = JSON.stringify(Cdsdata).replace('string', '')
                                let tenant = JSON.parse(Cdsdata1).tenant
                                console.log("Response from http client : ", tenant)

                                let Products = res1.data.value;

                                Vehicles.forEach(async (item) => {
                                    let filtered = Products.find((Prod) => {
                                        switch (tenant) {
                                            case '3847b3ff-57d0-4ef0-a250-c5b682249e88':
                                                return Prod.ID == item.ID;
                                                break;
                                            case '96c4f75d-d202-4bb3-8c13-dc78b8c5aba0':
                                                return Prod.ProductID == item.ID;
                                                break
                                            default:
                                                break;
                                        }

                                    })
                                    console.log(filtered, 'filtered')
                                    let NewStock = Math.round(item.Stock);
                                    switch (tenant) {
                                        case '3847b3ff-57d0-4ef0-a250-c5b682249e88':
                                            NewStock = NewStock + filtered.Price
                                            break;
                                        case '96c4f75d-d202-4bb3-8c13-dc78b8c5aba0':
                                            NewStock = NewStock + filtered.UnitsInStock
                                            break
                                        default:
                                            break;
                                    }

                                    let updatedstock = parseInt(NewStock)
                                    let VehID = item.ID;
                                    console.log(VehID, 'filtered', updatedstock)

                                    // let q3 = UPDATE('jobschedtest.db.VehiclesPurch').where({ ID: filtered.ID }).with({ Stock: { updatedstock } })
                                    // let query = UPDATE `jobschedtest.db.VehiclesPurch` .where `ID=${filtered.ID}` .with  `Stock: { '+=': newstock }` 
                                    if (filtered != undefined) {
                                        // await tx.run(UPDATE('jobschedtest.db.VehiclesPurch').where({ ID: VehID }).with({ Stock: { updatedstock } }));
                                        // let updatedstocks = await tx1.run(UPDATE('jobschedtest.db.VehiclesPurch').where({ ID: filtered.ID }).with({ Stock: { updatedstock } }))
                                        // let updatedstocks = await tx1.run(q3);
                                        // console.log('updatedstocks', updatedstocks)

                                        //+++Working one
                                        let tx1 = cds.tx({ tenant: tenant })
                                        try {
                                            await tx1.update('jobschedtest.db.VehiclesPurch')
                                                .with({ Stock: { '=': updatedstock } })
                                                .where({ ID: { '=': VehID } });
                                            await tx1.commit();
                                        } catch (error) {
                                            console.log(error, 'Error Occurred during ')
                                        }

                                        // console.log('Timeout Mechanism')
                                        // setTimeout(1000)
                                    }
                                });

                                // let Vehicles1 = await tx.run(SELECT.from('jobschedtest.db.VehiclesPurch'))
                                // console.log('CDS Spawn Ended', Vehicles1)

                            } catch (err) {
                                console.log("Error Occured");
                            }

                        }).catch(function (error) {
                            console.error(error);
                        });
                        // const nwsco = await cds.connect.to('nw');
                        // const { Products } = nwsco.entities
                        // console.log(Products, "Entities", cds.context)
                        // const tx1 = nwsco.transaction({ tenant: item.Tenant });
                        // console.log('Destination Query Start')
                        // const cats = await cds.connect.to('CatalogService')s
                        // const res2 = await cats.userInfo()
                        // tx.send('userInfo');
                        // const cqn = SELECT.from(Products)
                        // let result = await tx.read(Products)
                        // let result = await tx1.get("/Products")
                        // let Products1 = result;
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

                        let id = results[0].count + 1;
                        let tenant = req.data.subscribedTenantId;
                        let domain = req.data.subscribedSubdomain;
                        // let sql1 = `INSERT INTO "jobschedtest.dbcommon::Vehicles" VALUES(3,'3847b3ff-57d0-4ef0-a250-c5b682249e89',false)`
                        let sql1 = `INSERT INTO "jobschedtest.dbcommon::Vehicles" VALUES(${id},'${tenant}','${domain},false)`
                        console.log(sql1, 'sql')
                        const statement1 = await db.preparePromisified(sql1);
                        const results1 = await db.statementExecPromisified(statement1, []);
                        console.log('Results from Execution1', results1)
                        // return results;
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