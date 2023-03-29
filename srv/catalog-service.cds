using {jobschedtest.db as db} from '../db/data-model';

// using {CV_SALES, CV_SESSION_INFO} from '../db/data-model';

@(requires : 'authenticated-user')
service CatalogService @(path : '/catalog') {
  entity VehiclesPurchased as select * from db.VehiclesPurch actions {
                                action Inspection() returns VehiclesPurchased;
                              };

  function PuchaseVehicles @(restrict : [{
    grant : '*',
    to    : 'JOBSCHEDULER'
  }])()                        returns String;

  type VehicleAvailable : {
    ID                 : UUID;
    Carname            : String(100);
    Makeyear           : Integer;
    OriginCountry      : String(40);
    Stock              : Integer;
    Price              : Decimal(15, 3);
    Currency           : String;
    AvailableColors    : array of String;
    InspectionPassed   : Boolean;
    InspectionStatus   : String(50);
    InspectionComments : String
  }

  function AvailableVehicles() returns VehicleAvailable;

  function schedulejob
                      // @(restrict : [{
                      //   grant : 'READ',
                      //   to    : 'JOBSCHEDULER'
                      // }])
           ()                  returns String;

  type userScopes {
    identified    : Boolean;
    authenticated : Boolean;
  };

  type userType {
    user   : String;
    locale : String;
    tenant : String;
    scopes : userScopes;
  };

  function userInfo()          returns userType;

};

service Jobs @(path : '/jobs') {
  function PuchaseVehicles @(restrict : [{
    grant : '*',
    to    : 'JOBSCHEDULER'
  }])()                        returns String;

  type VehicleAvailable : {
    ID                 : UUID;
    Carname            : String(100);
    Makeyear           : Integer;
    OriginCountry      : String(40);
    Stock              : Integer;
    Price              : Decimal(15, 3);
    Currency           : String;
    AvailableColors    : array of String;
    InspectionPassed   : Boolean;
    InspectionStatus   : String(50);
    InspectionComments : String
  }

  function AvailableVehicles() returns VehicleAvailable;

  function schedulejob
                      // @(restrict : [{
                      //   grant : 'READ',
                      //   to    : 'JOBSCHEDULER'
                      // }])

           ()                  returns String;

}
