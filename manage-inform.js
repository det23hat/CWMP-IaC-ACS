var http = require('http');
var url = require('url');
const fs = require('fs');
const keygen = require('ssh-keygen');
const child_process = require('child_process');
const readline = require('readline');
const port = 5001;
//var containerInfoFilePath = '@../info/newVerImageList.json'
var containerInfoFileName = 'systemA';
//const containerInfoTempFilePath = `../tmp/${containerInfoFileName}.json`;
var containerInfoFilePath = `@../info/${containerInfoFileName}.json`;
var format = 'PEM';
var cpeExtraVars;
var containerName;
var imageName;
const { parse } = require('json2csv');
const fields = ['no.', 'time'];
const opts = { fields };
var dataList=[];

const server = http.createServer(async(req, res) => {
    var urlObj = url.parse(req.url, true);
    const queryObject = urlObj.query;
    console.log(urlObj.pathname)
    if(urlObj.pathname == '/notice-change/playbook'){
      let state=queryObject.status;
      if(state == 0){
        console.log("--- 開始腳本更新 ---")
      }else if(state == 1){
        console.log("---- 腳本已更新 ----");
      }
      res.end();
    }
    else if(urlObj.pathname == '/notice-change/DU'){
      console.log("---- 已有新DU可部署 ----");
      containerInfoFileName=queryObject.filename;
      //containerName=queryObject.ContainerName;
      //imageName=queryObject.du_name + ":" + queryObject.du_ver
      //console.log(containerInfoFileName);
      req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        //console.log(reqBody)
        res.end();
        containerName=reqBody.ContainerName;
        imageName=reqBody.ImageName;
        console.log("---- 產生暫時性DU資訊 ----");
        await createContainerInfoTmpFile();
        main();
      })
    }
    else if(urlObj.pathname == '/notice-change/systemForCPE'){
      console.log("---- new system for CPE has released ----");
      res.end();
      main();
    }
    else if(urlObj.pathname == '/notice-change/systemForACS'){
      console.log("---- new system for ACS has released ----");
      res.end();
      main();
    }
    else if(urlObj.pathname == '/inform/2'){
        req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        let host = reqBody.hostname;
        cpeExtraVars=JSON.stringify({
          host: host,
          is_du_update: 1
        })
        await updateVersion(cpeExtraVars);
       
        res.end();
        });
    }else if (urlObj.pathname == '/inform/1'){
        req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        let mac = reqBody.host_mac_addr;
        let host = reqBody.ansible_ssh_host;

        let status = await registerCpe(mac,host)

        console.log(`status = ${status}`)
        if (status == 0){
          console.log(`CPE ${mac} 註冊完成`);
          res.end();
        }else{
          console.log(`CPE ${mac} 註冊失敗`);
          res.end();
        }
      })
    }else if(urlObj.pathname == '/fortest/DU'){
      req.on('data',async (chunk) => {
        reqBody = JSON.parse(chunk);
        let host = reqBody.host;
        console.log("---- 新DU需部署 ----");
        containerInfoFileName='fortest';
        let starttime = Date.now();
        deployNewDU(host).then((end)=>{
          let totalSpend= end - starttime;
          // let data={
          //     no: i,
          //     time: totalSpend
          //   };
          console.log(host+" spend time:"+totalSpend)
        });
        res.end();
      })
      // host='cpe'
      // for(i=1;i<=5;i++){
      //   let starttime = Date.now();
      //   let end = await deployNewDU(host);
      //   let totalSpend= end - starttime;
      //   let data={
      //     no: i,
      //     time: totalSpend
      //   };
      //   dataList.push(data);
      //   console.log(totalSpend)
      // }
      //write();
    }
      
})

function write(){
  const csv = parse(dataList, opts);
  fs.writeFile('../info/test_10.csv', csv, (err)=>{
    if (err){
      console.log(err)
      
    };
    console.log("寫檔案")
    
  });
}

function main(){
  return new Promise((resolve, rejects) => {
    const q0 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    q0.question('1 :CPE配置相關動作\n2 :更新DU文件\n3 :離開\n選擇所需執行之選項，並按Enter以繼續：',async(q0Ans) => {
        q0.close();
        if(q0Ans == '1'){
          try {
            await main_deploy();
          } catch (error) {
            rejects(1)
          }
          resolve(0);
        }else if(q0Ans == '2'){

          const q3 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          })
          q3.question('請輸入欲更新的文件名稱：', async(answer) => {
            q3.close();
            containerInfoFileName=answer;            
            await updateDUFile(containerInfoFileName);
            await main_deploy();
            resolve(0);
          })

        }else if(q0Ans == '3'){
          resolve(0);
        }
    })
  })
}

function main_deploy(){
  return new Promise((resolve, reject) => {
    let q1Ans;
    let q2Ans;
    let host;
    process.stdin.setEncoding('utf8');
  
    const q1 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })  
    q1.question('1 :對特定CPE進行初始配置\n2 :新模組部署\n3 :模組版本更新\n4 :系統版本更新\n5 :離開\n選擇所需執行之選項，並按Enter以繼續：', async(answer) => {
          q1Ans = answer;
          q1.close();
          console.log(q1Ans);
          if(q1Ans == '5'){
              resolve(0);
          }else{
            const q2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            q2.question('CPE配置範圍\n1 :全部CPE\n2 :指定群組內的CPE\n3 :指定CPE\n選擇所需執行範圍之選項，並按Enter以繼續：', async(answer) => {
                q2Ans = answer;
                q2.close();
                host = await getHostName(q2Ans);
                switch(q1Ans) {
                    case '1':
                      cpeExtraVars =JSON.stringify({
                        host: host,
                      }) 
                      console.log(`執行CPE初始配置,執行範圍：${host}`);
                      await cpeInitialConfig(cpeExtraVars,host);
                      main();
                      resolve(0);
                    break;
                    case '2': 
                      console.log(`執行新模組部署,執行範圍：${host}`);
                      try {
                        await deployNewDU(host);
                        main();
                      } catch (error) {
                        reject(1);
                      }
                      resolve(0);
                    break;
                    case '3':
                      cpeExtraVars=JSON.stringify({
                        host: host,
                        is_du_update: 1
                      }) 
                      console.log(`執行模組版本更新,執行範圍：${host}`);
                      await updateVersion(cpeExtraVars);
                      main();
                      resolve(0);
                    break;
                    case '4':
                      cpeExtraVars=JSON.stringify({
                        host: host,
                        is_system_update: 1
                      })                    
                      console.log(`執行系統版本更新,執行範圍：${host}`);
                      await updateVersion(cpeExtraVars);
                      main();
                      resolve(0);
                    break;
                    default: 
                      main();
                      resolve(0);
                    break;
                }
            })
        }
        return 0;
    });
  })
}
server.listen(port);

async function getHostName(q2Ans){
  return new Promise(async (resolve,rejects) => {
  let name;
  switch(q2Ans){
      case '1':
          name = 'cpe';
          resolve(name);
      break;
      case '2':
          console.log('請輸入群組名稱:');
          process.stdin.on('readable',()=>{
              var input = process.stdin.read();
              if(input !== null) {
                  name = input.trim();
              }
              resolve(name);
          });
      break;
      case '3':
          console.log('請輸入CPE名稱:');
          process.stdin.on('readable',()=>{
              var input = process.stdin.read();
              if(input !== null) {
                  name = input.trim();
                  resolve(name);
              }
          });
      break;
      default:
          name = 'cpe';
          resolve(name);
      break;                
  }
  })
  
}

async function registerCpe(macAddr,ip){
  return new Promise(async (resolve,rejects) => {
    let key_dir = `../cpe_ssh_keys/${macAddr}`;
    let key_path = `../cpe_ssh_keys/${macAddr}/cpeKey`;
    //process.chdir('/cpe_ssh_keys');
    if (!fs.existsSync(key_dir)){
      fs.mkdir(key_dir,'0777',async (err) => { 
        if (err) { 
            return console.error(err); 
        }else{
          let status = await addCpe(key_path,macAddr,ip);
          if(status == 0)
            resolve(0)
          else
            rejects(1)

        }   
      })
    }else{
      let status = await addCpe(key_path,macAddr,ip);
      if(status == 0)
        resolve(0)
      else
        rejects(1)
    }
  });
  
}

function addCpe(key_path,macAddr,ip){
  return new Promise((resolve,rejects) => {
    //console.log("add key")
    keygen({
      location: key_path,
      read: true,
      format: format
    },function(err, out){
        if(err) return console.log('ssh key產生失敗: '+err);
        console.log('完成產生ssh key');
        //console.log('public key: '+out.pubKey);
        let register_new_cpe_extra_vars=JSON.stringify({
          host: macAddr,
          ansible_ip: ip,
          ssh_key_path: key_path
        })
        let configCpeExtraVar = JSON.stringify({
          host: macAddr
        })

        var registerNewCpe = child_process.spawn('ansible-playbook',['register-new-cpe.yml','--extra-vars',`${register_new_cpe_extra_vars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
        
        registerNewCpe.stdout.on('data', function (data) {
          console.log(' ' + data);
        });

        registerNewCpe.stderr.on('data', function (data) {
          console.log(' ' + data);
        });
  
        registerNewCpe.on('exit', async function (code) {
  
              if(code == 0){
                console.log(`CPE-${macAddr} 註冊成功`);
                let config_result = cpeInitialConfig(configCpeExtraVar);
                if (config_result == 0){
                  resolve(0);
                }else{
                  rejects(1);
                }
              }else{
                console.log("cpe連線資訊加入失敗")
                rejects(1);
              }
          });
    });
  });
  
}

function cpeInitialConfig(cpeExtraVars){
  return new Promise((resolve,rejects) => {
    var configNewCpe = child_process.spawn('ansible-playbook',['config-new-cpe.yml','--extra-vars',`${cpeExtraVars}`,'--extra-vars',`${containerInfoFilePath}`],{ cwd:'../ansible_playbook'});
    configNewCpe.stdout.on('data', function (data) {
      console.log(' ' + data);
    });
    configNewCpe.on('exit', function (code){
      if(code == 0){
        resolve(0);
      }else{
        console.log("cpe初始配置失敗")
        rejects(1);
      }
    });
  })
}

function updateVersion(cpeExtraVars){
  return new Promise((resolve,rejects) => {
    var updateContainerVer = child_process.spawn('ansible-playbook',['check-and-update-du.yml','--extra-vars',`${containerInfoFilePath}`,'--extra-vars',`${cpeExtraVars}`],{ cwd:'../ansible_playbook'});
          
    updateContainerVer.stdout.on('data', function (data) {
      console.log(' ' + data);
    });

    updateContainerVer.stderr.on('data', function (data) {
      console.log(' ' + data);
    });

    updateContainerVer.on('close', (code) => {
      if (code == 0) {
        console.log('DU版本更新完成');
        resolve(0);
      }else{
        console.log('DU版本更新失敗');
        rejects(1);
      }
    });

  })
}

function deployNewDU(host){
  return new Promise((resolve,rejects) => {
    containerInfoFilePath = `@../info/${containerInfoFileName}.json`;
    var deployNewContainer = child_process.spawn('ansible-playbook',['check-and-deploy-du.yml','--extra-vars',`${containerInfoFilePath}`,'-e',`host=${host}`],{ cwd:'../ansible_playbook'});
    
    // deployNewContainer.stdout.on('data', function (data) {
    //   console.log(' ' + data);
    // });

    deployNewContainer.stderr.on('data', function (data) {
      console.log('e: ' + data);
    });

    deployNewContainer.on('close', (code) => {
      if (code == 0) {
        console.log('部署DU完成');
        var endTime = Date.now();
        resolve(endTime);
      }else{
        console.log('DU部署失敗');
        rejects(1);
      }
    })

  })
}

function createContainerInfoTmpFile(){
  return new Promise((resolve,rejects) => {
    cpeExtraVars = JSON.stringify({
      container_name: containerName,
      image_ver: imageName,
      filename: containerInfoFileName
    })
    var createTmpFile = child_process.spawn('ansible-playbook',['create-du-tmp-file.yml','--extra-vars',`${cpeExtraVars}`],{ cwd:'../ansible_playbook'});
    createTmpFile.stdout.on('data', function (data) {
      console.log(' ' + data);
    });
    createTmpFile.stderr.on('data', function (data) {
      console.log(' ' + data);
    });
    createTmpFile.on('close', (code) => {
        if (code == 0) {
          console.log('新增tmp文件完成');
          resolve(0);
        }else{
          console.log('新增tmp文件失敗');
          rejects(1);
        }
    })
  })
}

function updateDUFile(containerInfoFileName){
  return new Promise((resolve,rejects) => {
    cpeExtraVars = JSON.stringify({
      filename: containerInfoFileName
    })

    var updateDUFileVer = child_process.spawn('ansible-playbook',['update-du-file.yml','-e',`filename=${containerInfoFileName}`],{ cwd:'../ansible_playbook'});

    updateDUFileVer.stdout.on('data', function (data) {
      console.log(' ' + data);
    });

    updateDUFileVer.stderr.on('data', function (data) {
      console.log(' ' + data);
    });

    updateDUFileVer.on('close', (code) => {
      if (code == 0) {
        console.log('DU文件更新完成');
        resolve(0);
      }else{
        console.log('DU文件更新失敗');
        rejects(1);
      }
    })

  })
}