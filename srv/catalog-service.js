const cds = require('@sap/cds');
const debug = require('debug')('srv:catalog-service');
const log = require('cf-nodejs-logging-support');
log.setLoggingLevel('info');
log.registerCustomFields(["country", "amount"]);
const dbClass = require('sap-hdbext-promisfied');
const axios = require('axios')
const xsenv = require('@sap/xsenv');

module.exports = cds.service.impl(async function () {

    const nwsco = await cds.connect.to('nw');
    // const VehSrv = await cds.connect.to('CatalogService');
    let db = await cds.connect.to('db')

    // xsenv.loadEnv();
    const {
        VehiclesPurchased
    } = this.entities;

    const entities = this.entities

    this.after('READ', 'VehiclesPurchased', async (each) => {
        // const cs = await cds.connect.to('CatalogService');
        // let results = await cs.read(SELECT.from(VehiclesPurchased));
        // console.log(results)
        // console.log('entities', entities)
        // if (each.amount > 500) {
        //     each.criticality = 3;
        //     if (each.comments === null)
        //         each.comments = '';
        //     else
        //         each.comments += ' ';
        //     each.comments += 'Exceptional!';
        //     debug(each.comments, {"country": each.country, "amount": each.amount});
        //     log.info(each.comments, {"country": each.country, "amount": each.amount});
        // } else if (each.amount < 150) {
        //     each.criticality = 1;
        // } else {
        //     each.criticality = 2;
        // }
    });

    this.on('Inspection', 'VehiclesPurchased', async req => {
        try {
            const ID = req.params[0];
            const tx = cds.tx(req);
            // await tx.update(Sales)
            //     .with({ amount: { '+=': 250 }, comments: 'Boosted!' })
            //     .where({ ID: { '=': ID } })
            //     ;
            // debug('Boosted ID:', ID);
            // const cs = await cds.connect.to('CatalogService');
            // let results = await cs.read(SELECT.from(Sales, ID));
            // return results;
        } catch (err) {
            req.reject(err);
        }
    });


    this.on('topSales', async (req) => {
        try {
            const tx = cds.tx(req);
            const results = await tx.run(`CALL "JOBSCHEDTEST_DB_SP_TopSales"(?,?)`, [req.data.amount]);
            return results.RESULT;
        } catch (err) {
            req.reject(err);
        }
    });

    this.on('AvailableVehicles', async req => {

        // const cs = await cds.connect.to('CatalogService');
        // let results = await cs.read(SELECT.from(VehiclesPurchased));
        // console.log(results)
        try {
            let db = new dbClass(await dbClass.createConnectionFromEnv(dbClass.resolveEnv(null)));
            let sql = `SELECT COUNT(*) AS "count" FROM "jobschedtest.dbcommon::Vehicles"`;
            // let sql = `SELECT * FROM "jobschedtest.dbcommon::Vehicles"`;
            const statement = await db.preparePromisified(sql);
            const results = await db.statementExecPromisified(statement, []);
            console.log('Results from Execution', results)

            let id = results[0].count + 1;
            let tenant = cds.context.tenant;
            // let sql1 = `INSERT INTO "jobschedtest.dbcommon::Vehicles" VALUES(3,'3847b3ff-57d0-4ef0-a250-c5b682249e89',false)`
            let sql1 = `INSERT INTO "jobschedtest.dbcommon::Vehicles" VALUES(${id},'${tenant}',false)`
            console.log(sql1, 'sql')
            const statement1 = await db.preparePromisified(sql1);
            const results1 = await db.statementExecPromisified(statement1, []);
            console.log('Results from Execution1', results1)
            return results;
        } catch (err) {
            console.error('Error Occured', err);
        }
    });

    this.on('userInfo', req => {
        let results = {};
        results.user = cds.context.user.id;
        results.locale = cds.context.locale;
        results.scopes = {};
        results.scopes.identified = req.user.is('identified-user');
        results.scopes.authenticated = req.user.is('authenticated-user');
        results.tenant = cds.context.tenant;
        return results;
    });

    this.on('PuchaseVehicles', async req => {

        try {

            let tenant = cds.context.tenant;
            console.log('Purchase Vehicles')
            debug('Purchase Vehicles Triggered')

            const tx = nwsco.transaction(req);
            debug('Request Check')
            console.log('Destination Query Start')
            let result = await tx.get("/Products")
            let Products = result;
            console.log('Destination Query Result', Products)

            const tx1 = db.tx(req); //VehSrv.transaction(req);

            let Vehicles = await tx1.run(SELECT.from('jobschedtest.db.VehiclesPurch')) //tx1.read('VehiclesPurch')
            console.log('Vehicle Data', Vehicles)

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
                    // let updatedstocks = await tx1.run(UPDATE('jobschedtest.db.VehiclesPurch').where({ ID: filtered.ID }).with({ Stock: { updatedstock } }))
                    // let updatedstocks = await tx1.run(q3);
                    // console.log('updatedstocks', updatedstocks)

                    //+++Working one
                    await tx1.update('jobschedtest.db.VehiclesPurch')
                        .with({ Stock: { '=': updatedstock } })
                        .where({ ID: { '=': VehID } })
                        ;
                }
            })
        } catch (error) {
            console.log('error')
        }


        //jobschedtest.db.VehiclesPurch
        // const cs = await cds.connect.to('CatalogService');
        // let results = await cds.read('VehiclesPurchased');

        // await tx.update(VehiclesPurchased)
        //     .with({ amount: { '+=': 250 }, comments: 'Boosted!' })
        //     .where({ ID: { '=': ID } })
        //     ;
        // VehiclesPurchased
    })

    this.on('schedulejob', async req => {
        try {
            console.log('schedulejob Start')
            console.log('schedulejob', 'Path', req.headers.referer, req.headers.host)
            const services = xsenv.getServices({
                jobscheduler: { label: 'jobscheduler' },
            });

            let tenant = cds.context.tenant;

            let tenanturl = req.headers.referer;

            switch (tenant) {
                case '3847b3ff-57d0-4ef0-a250-c5b682249e88':
                    tenanturl = 'https://poc-multi-tenancy-subscriber1-igfpa9w7-jobschedtest-app.cfapps.eu10.hana.ondemand.com/';
                    break;
                case '96c4f75d-d202-4bb3-8c13-dc78b8c5aba0':
                    tenanturl = 'https://poc-multi-tenancy-subscriber2-iqndot9n-jobschedtest-app.cfapps.eu10.hana.ondemand.com/';
                    break
                default:
                    break;
            }
            // if (tenanturl == undefined) {
            //     tenanturl = 'https://poc-multi-tenancy-subscriber1-igfpa9w7-jobschedtest-app.cfapps.eu10.hana.ondemand.com/';
            // }
            let refererurl = tenanturl.replace('https://', '')
            let subdomain = refererurl.split('-jobschedtest-app')[0]
            let uaaDomain = services.jobscheduler.uaa.uaadomain

            let jobSchclienSecret = services.jobscheduler.uaa.clientsecret
            let clientid = services.jobscheduler.uaa.clientid

            let jobscheduleurl = services.jobscheduler.url

            const options = {
                method: 'POST',
                url: 'https://' + subdomain + '.' + uaaDomain + '/oauth/token',
                headers: {
                    cookie: '__VCAP_ID__=b14aa3ec-f5e2-4876-5b5b-88b4; X-Uaa-Csrf=iFCLS82luraWQewcwzjiIU; JSESSIONID=B722D21967E59EF467899FAFB91F3CCB; __VCAP_ID__=c18fb389-384c-49b0-4314-cdab',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: {
                    client_id: clientid,
                    client_secret: jobSchclienSecret,
                    grant_type: 'client_credentials'
                }
            };
            console.log('Options', services)
            axios.request(options).then(function (response) {
                console.log(response.data);
                let access_token = response.data.access_token;

                const joboptions = {
                    method: 'POST',
                    url: jobscheduleurl + '/scheduler/jobs',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + access_token
                    },
                    data: JSON.stringify({
                        name: 'TestJob_' + new Date().getMilliseconds(),
                        action: tenanturl + 'jobs/PuchaseVehicles()',
                        active: true,
                        httpMethod: 'GET',
                        schedules: [{ time: 'now', active: true }]
                    })
                };
                //   action: 'https://poc-multi-tenancy-subscriber1-igfpa9w7-jobschedtest-app.cfapps.eu10.hana.ondemand.com/jobs/schedulejob()',
                console.log('Options1', joboptions)

                axios.request(joboptions).then(function (response) {
                    console.log(response.data);
                }).catch(function (error) {
                    console.error('error Occured during job post');
                });

            }).catch(function (error) {
                console.error("error Occured during Axios post");
            });

        } catch (error) {
            console.log(error)
        }
        // console.log('schedulejob Start')
        // console.log('schedulejob', 'Path', req.headers.referer, req.headers.host)
        // const services = xsenv.getServices({
        //     jobscheduler: { label: 'jobscheduler' },
        // });

        // let tenanturl = req.headers.referer;
        // let refererurl = req.headers.referer.replace('https://', '')
        // let subdomain = refererurl.split('-jobschedtest-app')[0]
        // let uaaDomain = services.jobscheduler.uaa.uaadomain

        // let jobSchclienSecret = services.jobscheduler.uaa.clientsecret
        // let clientid = services.jobscheduler.uaa.clientid

        // let jobscheduleurl = services.jobscheduler.url

        // const options = {
        //     method: 'POST',
        //     url: 'https://' + subdomain + '.' + uaaDomain + '/oauth/token',
        //     headers: {
        //         cookie: '__VCAP_ID__=b14aa3ec-f5e2-4876-5b5b-88b4; X-Uaa-Csrf=iFCLS82luraWQewcwzjiIU; JSESSIONID=B722D21967E59EF467899FAFB91F3CCB; __VCAP_ID__=c18fb389-384c-49b0-4314-cdab',
        //         'Content-Type': 'application/x-www-form-urlencoded'
        //     },
        //     data: {
        //         client_id: clientid,
        //         client_secret: jobSchclienSecret,
        //         grant_type: 'client_credentials'
        //     }
        // };
        // console.log('Options', options)
        // axios.request(options).then(function (response) {
        //     console.log(response.data);
        //     let access_token = response.data.access_token;

        //     const joboptions = {
        //         method: 'POST',
        //         url: jobscheduleurl + '/scheduler/jobs',
        //         headers: {
        //             'Content-Type': 'application/json',
        //             Authorization: 'Bearer ' + access_token
        //         },
        //         data: JSON.stringify({
        //             name: 'TestJob_' + new Date().getMilliseconds(),
        //             action: tenanturl + 'jobs/PuchaseVehicles()',
        //             active: true,
        //             httpMethod: 'GET',
        //             schedules: [{ time: 'now', active: true }]
        //         })
        //     };
        //     //   action: 'https://poc-multi-tenancy-subscriber1-igfpa9w7-jobschedtest-app.cfapps.eu10.hana.ondemand.com/jobs/schedulejob()',
        //     console.log('Options1', joboptions)

        //     axios.request(joboptions).then(function (response) {
        //         console.log(response.data);
        //     }).catch(function (error) {
        //         console.error('error Occured during job post');
        //     });

        // }).catch(function (error) {
        //     console.error("error Occured during Axios post");
        // });


        ///Not Needed
        // console.log('Services Loaded', services);
        // const VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);
        // let clientId = "sb-05a65bdc-5917-48d8-927c-e2e6c3c3b9a8!b197539|sap-jobscheduler!b3";
        // console.log(VCAP_SERVICES)
        // let clientSecret = "fc9309ba-e057-4a36-a1bd-dd13144b26d6$bgDTWk7W8fIH8G_nRIlfzNbpO2goirAAX5iGa_9qSJk=";
        // let clientSecret = VCAP_SERVICES.jobscheduler.credentials.uaa.clientsecret;
        // let token = "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vcG9jLW11bHRpLXRlbmFuY3ktc3Vic2NyaWJlcjEtaWdmcGE5dzcuYXV0aGVudGljYXRpb24uZXUxMC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoiZGVmYXVsdC1qd3Qta2V5LTg0NDY4MDcwMCIsInR5cCI6IkpXVCIsImppZCI6ICJCb3dhcTZZTjlJcW1EQXFrN1lla2o0ZDlWcUdZRS9wQkR2RmNRRmJIY2FZPSJ9.eyJqdGkiOiI2ZTBlZjFmNjNiMzQ0N2QzYmM1MTMwOWQzM2ZhNjNhYyIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiIzODQ3YjNmZi01N2QwLTRlZjAtYTI1MC1jNWI2ODIyNDllODgiLCJ6ZG4iOiJwb2MtbXVsdGktdGVuYW5jeS1zdWJzY3JpYmVyMS1pZ2ZwYTl3NyIsInNlcnZpY2VpbnN0YW5jZWlkIjoiMDVhNjViZGMtNTkxNy00OGQ4LTkyN2MtZTJlNmMzYzNiOWE4In0sInN1YiI6InNiLTA1YTY1YmRjLTU5MTctNDhkOC05MjdjLWUyZTZjM2MzYjlhOCFiMTk3NTM5fHNhcC1qb2JzY2hlZHVsZXIhYjMiLCJhdXRob3JpdGllcyI6WyJ1YWEucmVzb3VyY2UiLCJqb2JzY2hlZHRlc3QhdDE5NzUzOS5KT0JTQ0hFRFVMRVIiXSwic2NvcGUiOlsidWFhLnJlc291cmNlIiwiam9ic2NoZWR0ZXN0IXQxOTc1MzkuSk9CU0NIRURVTEVSIl0sImNsaWVudF9pZCI6InNiLTA1YTY1YmRjLTU5MTctNDhkOC05MjdjLWUyZTZjM2MzYjlhOCFiMTk3NTM5fHNhcC1qb2JzY2hlZHVsZXIhYjMiLCJjaWQiOiJzYi0wNWE2NWJkYy01OTE3LTQ4ZDgtOTI3Yy1lMmU2YzNjM2I5YTghYjE5NzUzOXxzYXAtam9ic2NoZWR1bGVyIWIzIiwiYXpwIjoic2ItMDVhNjViZGMtNTkxNy00OGQ4LTkyN2MtZTJlNmMzYzNiOWE4IWIxOTc1Mzl8c2FwLWpvYnNjaGVkdWxlciFiMyIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJyZXZfc2lnIjoiOWMwOGZhZjciLCJpYXQiOjE2Nzk0NzM1ODcsImV4cCI6MTY3OTUxNjc4NywiaXNzIjoiaHR0cHM6Ly9wb2MtbXVsdGktdGVuYW5jeS1zdWJzY3JpYmVyMS1pZ2ZwYTl3Ny5hdXRoZW50aWNhdGlvbi5ldTEwLmhhbmEub25kZW1hbmQuY29tL29hdXRoL3Rva2VuIiwiemlkIjoiMzg0N2IzZmYtNTdkMC00ZWYwLWEyNTAtYzViNjgyMjQ5ZTg4IiwiYXVkIjpbInNiLTA1YTY1YmRjLTU5MTctNDhkOC05MjdjLWUyZTZjM2MzYjlhOCFiMTk3NTM5fHNhcC1qb2JzY2hlZHVsZXIhYjMiLCJ1YWEiLCJqb2JzY2hlZHRlc3QhdDE5NzUzOSJdfQ.rbHcwfQS8TFPEjjpcO9X95x4_PJrWQQJ1chj4Vw-leH0TV-ZNIH3DegRaiS_IYEwXcGKh8Axw_jEDo5RYRUwniz01AFNFSCt1075clInb7nx6Z6SyyLe4kk1MlY-fOVzV2EJJyMms_lJO8Uc7Nh7C_CycQ1Ny0MKGiaANZAJO6Y1BWULk6R06Q1dulQ3e4rIYlq_2nfDcJI3cJ0w7Fm_AadFw42zV7cQ-Voua6Yd6mV76nZyrXt4_QVoSTk2syInwuD3qfXWDXIz5IRUHQoJ9rr_1Ld62dmJNB33n9mgebqB9HHrwnW9vXKWO2CUZchJWnhqLDa2o4f6PhBDbSKyIQ"

        // console.log('clientSecret', clientSecret, services)
        // "e2ef09d3-2737-4804-b3f8-8da9e6511a03$1nyKOqRRuAYVpYPP-Necoo87VmRqm3LvqHsuGd9e_qU=",

        // "clientsecret": "c3e4a56a-fcd1-4d66-80dc-7ae3a3b4175e$qeQNu_ZoQmwYdzlD0vVBf2ABXnU8bJAb1M0OWJ7XuWw=",
        // const options = {
        //     host: 'https://poc-multi-tenancy-subscriber1-igfpa9w7.authentication.eu10.hana.ondemand.com',
        //     path: '/oauth/token?grant_type=client_credentials&response_type=token',
        //     headers: {
        //         Authorization: "Basic " + Buffer.from(clientId + ':' + clientSecret).toString("base64")
        //     }
        // };

        // const options = {
        //     method: 'POST',
        //     url: 'https://poc-multi-tenancy-subscriber1-igfpa9w7.authentication.eu10.hana.ondemand.com/oauth/token',
        //     headers: {
        //         //   cookie: 'X-Uaa-Csrf=iFCLS82luraWQewcwzjiIU; JSESSIONID=B722D21967E59EF467899FAFB91F3CCB; __VCAP_ID__=c18fb389-384c-49b0-4314-cdab',
        //         'Content-Type': 'application/x-www-form-urlencoded'
        //     },
        //     data: {
        //         client_id: clientId,
        //         client_secret: clientSecret,
        //         grant_type: 'client_credentials'
        //     }
        // };

        // axios.request(options).then(function (response) {
        //     console.log('Access Token Success', response.data);
        // }).catch(function (error) {
        //     console.error('Access Token Error', error);
        // });

        // console.log('VCAP Log', VCAP_SERVICES)
        ///Not Needed
        debug('schedulejob Triggered')
        let tenant = cds.context.tenant;
        return 'schedulejob Triggered / Tenant : ' + tenant
    })
});