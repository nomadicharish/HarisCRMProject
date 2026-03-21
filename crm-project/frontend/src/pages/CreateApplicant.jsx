import React, { useCallback, useEffect, useState } from "react";
import API from "../services/api";
import { createApplicant } from "../services/applicantService";
import "../styles/forms.css";

function CreateApplicant() {

const [countries,setCountries] = useState([]);
const [companies,setCompanies] = useState([]);
const [agencies,setAgencies] = useState([]);
const [user,setUser] = useState(null);

const [form,setForm] = useState({
firstName:"",
lastName:"",
dob:"",
phone:"",
whatsapp:"",
address:"",
placeOfBirth:"",
height:"",
weight:"",
maritalStatus:"",
countryId:"",
companyId:"",
agencyId:"",
totalAmount:"",
totalEmployerPayment:"",
amountPaid:""
});

const loadAgencies = useCallback(async ()=>{
const res = await API.get("/agencies");
setAgencies(res.data || []);
},[]);

const loadCountries = useCallback(async ()=>{
const res = await API.get("/countries");
setCountries(res.data || []);
},[]);

const loadCompanies = useCallback(async (countryId)=>{
const res = await API.get(`/companies?countryId=${countryId}`);
setCompanies(res.data || []);
},[]);

const loadUser = useCallback(async ()=>{
const res = await API.get("/auth/me");
setUser(res.data);

if(res.data.role === "SUPER_USER"){
await loadAgencies();
}
},[loadAgencies]);

/* eslint-disable react-hooks/set-state-in-effect */
useEffect(()=>{
loadUser();
loadCountries();
},[loadUser,loadCountries]);
/* eslint-enable react-hooks/set-state-in-effect */

const handleChange = (e)=>{

setForm({
...form,
[e.target.name]:e.target.value
});

if(e.target.name === "countryId"){
loadCompanies(e.target.value);
}

};

const handleSubmit = async (e)=>{
e.preventDefault();

try{

const payload = {
...form,
totalApplicantPayment: Number(form.totalAmount) || 0,
amountPaid: Number(form.amountPaid) || 0,
...(user?.role === "SUPER_USER" && form.totalEmployerPayment !== ""
? { totalEmployerPayment: Number(form.totalEmployerPayment) || 0 }
: {}),
...(user?.role === "AGENCY" ? { agencyId: user.uid } : {})
};

await createApplicant(payload);

alert("Applicant created successfully");

setForm({
firstName:"",
lastName:"",
dob:"",
phone:"",
whatsapp:"",
address:"",
placeOfBirth:"",
height:"",
weight:"",
maritalStatus:"",
countryId:"",
companyId:"",
agencyId:"",
totalAmount:"",
totalEmployerPayment:"",
amountPaid:""
});

}catch(err){

console.error(err);
alert("Error creating applicant");

}
};

return(

<div className="page-container">

<div className="page-content">

<h2>Create Applicant</h2>

<form onSubmit={handleSubmit}>

{/* Agency Selection */}

{user?.role === "SUPER_USER" && (

<div className="card">

<h3>Assign Agency</h3>

<div className="form-grid">

<div className="input-field">
<label>Agency</label>
<select name="agencyId" value={form.agencyId} onChange={handleChange} required>
<option value="">Select Agency</option>
{agencies.map(a=>(
<option key={a.id} value={a.id}>{a.name}</option>
))}
</select>
</div>

</div>

</div>

)}

{/* Personal Details */}

<div className="card">

<h3>Personal Details</h3>

<div className="form-grid">

<div className="input-field">
<label>First Name</label>
<input name="firstName" value={form.firstName} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Last Name</label>
<input name="lastName" value={form.lastName} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Date of Birth</label>
<input type="date" name="dob" value={form.dob} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Phone</label>
<input name="phone" value={form.phone} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Place of Birth</label>
<input name="placeOfBirth" value={form.placeOfBirth} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Address</label>
<input name="address" value={form.address} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Marital Status</label>
<select name="maritalStatus" value={form.maritalStatus} onChange={handleChange}>
<option value="">Select</option>
<option value="Single">Single</option>
<option value="Married">Married</option>
</select>
</div>

<div className="input-field">
<label>Height (cm)</label>
<input name="height" value={form.height} onChange={handleChange}/>
</div>

<div className="input-field">
<label>Weight (kg)</label>
<input name="weight" value={form.weight} onChange={handleChange}/>
</div>

</div>

</div>

{/* Job Details */}

<div className="card">

<h3>Job Details</h3>

<div className="form-grid">

<div className="input-field">
<label>Country</label>
<select name="countryId" value={form.countryId} onChange={handleChange}>
<option value="">Select Country</option>
{countries.map(c=>(
<option key={c.id} value={c.id}>{c.name}</option>
))}
</select>
</div>

<div className="input-field">
<label>Company</label>
<select name="companyId" value={form.companyId} onChange={handleChange}>
<option value="">Select Company</option>
{companies.map(c=>(
<option key={c.id} value={c.id}>{c.name}</option>
))}
</select>
</div>

</div>

</div>

{/* Payment */}

<div className="card">

<h3>Payment Details</h3>

<div className="form-grid">

<div className="input-field">
<label>Total Amount</label>
<input type="number" min="0" step="0.01" name="totalAmount" value={form.totalAmount} onChange={handleChange}/>
</div>

{user?.role === "SUPER_USER" && (
<div className="input-field">
<label>Total Employer Payment</label>
<input type="number" min="0" step="0.01" name="totalEmployerPayment" value={form.totalEmployerPayment} onChange={handleChange} required/>
</div>
)}

<div className="input-field">
<label>Amount Paid</label>
<input type="number" min="0" step="0.01" name="amountPaid" value={form.amountPaid} onChange={handleChange}/>
</div>

</div>

</div>

<button className="submit-btn">Create Applicant</button>

</form>

</div>

</div>

);

}

export default CreateApplicant;
