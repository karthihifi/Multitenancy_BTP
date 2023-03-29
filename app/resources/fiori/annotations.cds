using CatalogService as catalog from '../../../srv/catalog-service';

annotate catalog.VehiclesPurchased with {
    ID                 @title : 'ID'  @UI.HiddenFilter;
    Carname            @title : 'Car Name';
    Makeyear           @title : 'Make Year';
    OriginCountry      @title : 'Origin Country';
    Stock              @title : 'Stock';
    Price              @title : 'Price';
    Currency           @title : 'Currency';
    AvailableColors    @title : 'Colors';
    InspectionPassed   @title : 'Inspection Passed';
    InspectionStatus   @title : 'Inspec. Status';
    InspectionComments @title : 'Inspec. comments'
};


annotate catalog.VehiclesPurchased with
@(UI : {
    Identification  : [{Value : Carname}],
    SelectionFields : [],
    LineItem        : [
        {
            $Type  : 'UI.DataFieldForAction',
            Label  : 'Schedule Job',
            Action : 'CatalogService.EntityContainer/schedulejob',
        },
        {
            $Type : 'UI.DataField',
            Value : ID,
            Label : 'ID'
        },
        {
            $Type : 'UI.DataField',
            Value : Carname,
            Label : 'Car Name'
        },
        {
            $Type : 'UI.DataField',
            Value : Makeyear,
            Label : 'Make year'
        },
        {
            $Type : 'UI.DataField',
            Value : OriginCountry,
            Label : 'Country of Origin'
        },
        {
            $Type : 'UI.DataField',
            Value : Stock,
            Label : 'Stock'
        },
        {
            $Type : 'UI.DataField',
            Value : Price,
            Label : 'Price'
        },
        {
            $Type : 'UI.DataField',
            Value : AvailableColors,
            Label : 'Colors'
        },
    ],
    HeaderInfo      : {
        TypeName       : 'Available Cars',
        TypeNamePlural : 'Available Cars',
        Title          : {Value : Carname},
        Description    : {Value : Stock}
    }
});
